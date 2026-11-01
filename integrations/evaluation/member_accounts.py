"""Self-service membership on the existing BeeEVAL identity store. No parallel users DB."""
from __future__ import annotations
import hashlib,hmac,secrets,os,re,asyncio,inspect
from datetime import datetime,timezone
from fastapi import APIRouter,Depends,HTTPException,Request
from pydantic import BaseModel,Field
from api.auth.deps import require_user
from api.auth.password import hash_password,verify_password
from api.auth.jwt_utils import issue_token
from api.services.local_db_client import supabase
from api.services.email_service import send_email,get_smtp_config,is_valid_email
from api.core.config import settings
router=APIRouter(prefix='/api/auth',tags=['membership'])
PUBLIC='id, username, role, display_name, is_active, must_reset_pwd, password_version, created_at, expires_at, membership_tier, email, phone'
def public(row):
 return {k:(v.isoformat() if isinstance(v,datetime) else v)for k,v in row.items() if k!='password_version'}
def recipient(channel,value):
 value=value.strip().lower()
 if channel=='email' and is_valid_email(value):return value
 if channel=='phone' and re.fullmatch(r'\+?[1-9]\d{7,14}',value):return value
 raise HTTPException(400,detail='请输入有效的邮箱或手机号')
def digest(challenge,code):return hmac.new(str(settings.JWT_SECRET).encode(),(challenge+':'+code).encode(),hashlib.sha256).hexdigest()
def rate(bucket,limit):
 rows=supabase.raw_sql('''INSERT INTO member_verification_limits(bucket,hits,window_start) VALUES(%s,1,NOW()) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN member_verification_limits.window_start < NOW()-INTERVAL '1 hour' THEN 1 ELSE member_verification_limits.hits+1 END,window_start=CASE WHEN member_verification_limits.window_start < NOW()-INTERVAL '1 hour' THEN NOW() ELSE member_verification_limits.window_start END RETURNING hits''',[bucket]).data
 if rows[0]['hits']>limit:raise HTTPException(429,detail='请求过于频繁，请稍后再试')
class CodeRequest(BaseModel):
 channel:str=Field(pattern='^(email|phone)$')
 recipient:str=Field(min_length=3,max_length=254)
class RegisterRequest(CodeRequest):
 challenge:str=Field(min_length=16,max_length=64)
 code:str=Field(pattern=r'^\d{6}$')
 password:str=Field(min_length=10,max_length=128)
 display_name:str=Field(default='',max_length=40)
class ProfileRequest(BaseModel):
 username:str=Field(min_length=3,max_length=64)
 display_name:str=Field(default='',max_length=40)
@router.get('/registration-options')
def options():return {'email':get_smtp_config().configured,'phone':bool(os.getenv('SMS_VERIFICATION_URL')and os.getenv('SMS_VERIFICATION_TOKEN')),'wechat':bool(os.getenv('BEEEVAL_WECHAT_APPID') and os.getenv('BEEEVAL_WECHAT_APP_SECRET'))}
@router.post('/register-code')
async def code(req:CodeRequest,request:Request):
 target=recipient(req.channel,req.recipient);available=options()
 if not available[req.channel]:raise HTTPException(503,detail='该验证渠道暂未开通')
 rate('ip:'+str(request.client.host),20);rate(req.channel+':'+target,5)
 challenge=secrets.token_urlsafe(24);otp=str(secrets.randbelow(1000000)).zfill(6)
 # Atomic 60-second resend cooldown; a new code invalidates the previous challenge.
 rows=supabase.raw_sql('''INSERT INTO member_verifications(recipient,channel,challenge,code_hash,expires_at) VALUES(%s,%s,%s,%s,NOW()+INTERVAL '5 minutes') ON CONFLICT(recipient,channel) DO UPDATE SET challenge=EXCLUDED.challenge,code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,sent_at=NOW(),attempts=0,consumed=FALSE WHERE member_verifications.sent_at<NOW()-INTERVAL '60 seconds' RETURNING challenge''',[target,req.channel,challenge,digest(challenge,otp)]).data
 if not rows:raise HTTPException(429,detail='请等待60秒后重新获取验证码')
 try:
  if req.channel=='email':
   kwargs=dict(to_addr=target,subject='BeeEVAL 注册验证码',plain_body=f'您的注册验证码为 {otp}，5分钟内有效。请勿向他人泄露。若非您本人操作，请忽略此邮件。')
   if inspect.iscoroutinefunction(send_email):await send_email(**kwargs)
   else:await asyncio.to_thread(send_email,**kwargs)
  else:
   import httpx
   url=os.environ['SMS_VERIFICATION_URL']
   if not url.startswith('https://'):raise RuntimeError('SMS must use HTTPS')
   async with httpx.AsyncClient(timeout=15)as client:
    response=await client.post(url,headers={'Authorization':'Bearer '+os.environ['SMS_VERIFICATION_TOKEN']},json={'phone':target,'code':otp,'expires_in':300});response.raise_for_status()
 except Exception:
  supabase.raw_sql('DELETE FROM member_verifications WHERE challenge=%s',[challenge]);raise HTTPException(503,detail='验证码发送失败，请稍后重试')
 return {'challenge':challenge,'expires_in':300,'retry_after':60}
@router.post('/register')
def register(req:RegisterRequest):
 target=recipient(req.channel,req.recipient)
 if not(re.search('[A-Za-z]',req.password)and re.search('[0-9]',req.password)):raise HTTPException(400,detail='密码至少10位，须包含字母与数字')
 # Wrong attempts are counted even on failure; the actual create consumes the code atomically.
 rows=supabase.raw_sql('''UPDATE member_verifications SET attempts=attempts+1 WHERE recipient=%s AND channel=%s AND challenge=%s AND consumed=FALSE AND expires_at>NOW() AND attempts<5 RETURNING code_hash''',[target,req.channel,req.challenge]).data
 if not rows or not hmac.compare_digest(rows[0]['code_hash'],digest(req.challenge,req.code)):raise HTTPException(400,detail='验证码错误、过期或尝试次数过多')
 if supabase.raw_sql('SELECT id FROM users WHERE username=%s OR email=%s OR phone=%s',[target,target,target]).data:raise HTTPException(409,detail='该账号已存在，请直接登录')
 password=hash_password(req.password)
 rows=supabase.raw_sql(f'''WITH verified AS(UPDATE member_verifications SET consumed=TRUE WHERE challenge=%s AND recipient=%s AND consumed=FALSE AND expires_at>NOW() RETURNING recipient) INSERT INTO users(username,email,phone,password_hash,role,membership_tier,display_name,is_active,status,must_reset_pwd,password_version) SELECT %s,%s,%s,%s,'viewer','free',%s,TRUE,'active',FALSE,1 FROM verified RETURNING {PUBLIC}''',[req.challenge,target,target,target if req.channel=='email' else None,target if req.channel=='phone' else None,password,req.display_name.strip()]).data
 if not rows:raise HTTPException(400,detail='验证码已使用，请重新验证')
 row=rows[0];token=issue_token(user_id=int(row['id']),username=row['username'],role=row['role'],password_version=int(row['password_version']))
 return {'access_token':token,'user':public(row)}
@router.get('/profile')
def profile(user=Depends(require_user())):
 row=supabase.raw_sql(f'SELECT {PUBLIC} FROM users WHERE id=%s',[user['id']]).data[0];return {'user':public(row)}
@router.post('/profile')
def update(req:ProfileRequest,user=Depends(require_user())):
 name=req.username.strip()
 if not re.fullmatch(r'[A-Za-z0-9_@.+-]{3,64}',name):raise HTTPException(400,detail='账号仅支持字母、数字及 _ @ . + -')
 if supabase.raw_sql('SELECT id FROM users WHERE lower(username)=lower(%s) AND id<>%s',[name,user['id']]).data:raise HTTPException(409,detail='该账号名称已被使用')
 row=supabase.raw_sql(f'UPDATE users SET username=%s,display_name=%s,updated_at=NOW() WHERE id=%s RETURNING {PUBLIC}',[name,req.display_name.strip(),user['id']]).data[0];return {'user':public(row)}

class ReportGrant(BaseModel):
    user_id:int
    report_key:str=Field(pattern=r"^[a-z0-9-]{1,64}$")
@router.post('/report-entitlements')
def grant_report(req:ReportGrant,user=Depends(require_user(roles=('admin',)))):
    if req.report_key not in {'whitepaper','fallback','zeekr9x','l9livis','travel','multi-stop','i8-livis','scenarios'}:raise HTTPException(400,detail='报告不存在')
    if not supabase.raw_sql('SELECT id FROM users WHERE id=%s',[req.user_id]).data:raise HTTPException(404,detail='账号不存在')
    supabase.raw_sql('INSERT INTO user_report_entitlements(user_id,report_key,granted_by) VALUES(%s,%s,%s) ON CONFLICT(user_id,report_key) DO UPDATE SET granted_by=EXCLUDED.granted_by,granted_at=NOW(),expires_at=NULL',[req.user_id,req.report_key,user['id']])
    return {'ok':True}
