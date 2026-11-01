"""Email ownership proof for password recovery, independent of signup codes."""
from __future__ import annotations
import asyncio,inspect,hmac,re,secrets
from fastapi import APIRouter,HTTPException,Request
from pydantic import BaseModel,Field
from api.routers.member_accounts import recipient,digest,rate
from api.services.local_db_client import supabase
from api.services.email_service import send_email,get_smtp_config
from api.auth.password import hash_password

router=APIRouter(prefix='/api/auth',tags=['account-recovery'])
class RecoveryCode(BaseModel):
    recipient:str=Field(min_length=3,max_length=254)
class RecoveryReset(RecoveryCode):
    challenge:str=Field(min_length=16,max_length=64)
    code:str=Field(pattern=r'^\d{6}$')
    password:str=Field(min_length=10,max_length=128)

@router.post('/password-reset-code')
async def send_reset_code(req:RecoveryCode,request:Request):
    target=recipient('email',req.recipient)
    if not get_smtp_config().configured:raise HTTPException(503,detail='邮件服务暂不可用，请稍后重试。')
    rate('reset-ip:'+str(request.client.host),20);rate('reset-email:'+target,5)
    users=supabase.raw_sql("SELECT id FROM users WHERE is_active=TRUE AND status='active' AND (lower(email)=%s OR (email IS NULL AND lower(username)=%s))",[target,target]).data
    # Refuse ambiguous identities; generic response is identical to an unknown address.
    user_id=users[0]['id'] if len(users)==1 else None
    challenge=secrets.token_urlsafe(24);otp=str(secrets.randbelow(1000000)).zfill(6)
    rows=supabase.raw_sql('''INSERT INTO member_password_resets(recipient,user_id,challenge,code_hash,expires_at)
      VALUES(%s,%s,%s,%s,NOW()+INTERVAL '5 minutes') ON CONFLICT(recipient) DO UPDATE SET
      user_id=EXCLUDED.user_id,challenge=EXCLUDED.challenge,code_hash=EXCLUDED.code_hash,
      expires_at=EXCLUDED.expires_at,sent_at=NOW(),attempts=0,consumed=FALSE
      WHERE member_password_resets.sent_at<NOW()-INTERVAL '60 seconds' RETURNING challenge''',
      [target,user_id,challenge,digest('reset:'+challenge,otp)]).data
    if not rows:raise HTTPException(429,detail='请等待60秒后重新获取验证码。')
    if user_id is not None:
        try:
            kwargs=dict(to_addr=target,subject='BeeEVAL 重置密码验证码',plain_body=f'您的密码重置验证码为 {otp}，5分钟内有效。请勿向他人泄露。若非本人操作，请忽略此邮件，您的密码不会改变。')
            if inspect.iscoroutinefunction(send_email):await send_email(**kwargs)
            else:await asyncio.to_thread(send_email,**kwargs)
        except Exception:
            supabase.raw_sql('DELETE FROM member_password_resets WHERE challenge=%s',[challenge])
            raise HTTPException(503,detail='验证码发送失败，请稍后重试。')
    return {'challenge':challenge,'expires_in':300,'retry_after':60}

@router.post('/password-reset')
def reset_password(req:RecoveryReset):
    target=recipient('email',req.recipient)
    if not(re.search('[A-Za-z]',req.password) and re.search('[0-9]',req.password)):
        raise HTTPException(400,detail='密码至少10位，须包含字母与数字。')
    rows=supabase.raw_sql('''UPDATE member_password_resets SET attempts=attempts+1
      WHERE recipient=%s AND challenge=%s AND consumed=FALSE AND expires_at>NOW() AND attempts<5
      RETURNING code_hash,user_id''',[target,req.challenge]).data
    if not rows or not hmac.compare_digest(rows[0]['code_hash'],digest('reset:'+req.challenge,req.code)) or rows[0]['user_id'] is None:
        raise HTTPException(400,detail='验证码错误、过期或已使用，请重新验证。')
    rows=supabase.raw_sql('''WITH proof AS (
      UPDATE member_password_resets SET consumed=TRUE WHERE recipient=%s AND challenge=%s
      AND consumed=FALSE AND expires_at>NOW() RETURNING user_id
    ) UPDATE users SET password_hash=%s,must_reset_pwd=FALSE,password_version=password_version+1,updated_at=NOW()
      WHERE id IN(SELECT user_id FROM proof) AND is_active=TRUE AND status='active' RETURNING id''',
      [target,req.challenge,hash_password(req.password)]).data
    if not rows:raise HTTPException(400,detail='验证已失效，请重新获取验证码。')
    return {'ok':True}
