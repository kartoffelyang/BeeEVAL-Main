"""WeChat Mini signup in the existing users store; secrets stay on this server."""
from __future__ import annotations
import hashlib, os, secrets, logging
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from api.auth.jwt_utils import issue_token
from api.auth.password import hash_password
from api.services.local_db_client import supabase
from api.routers.member_accounts import PUBLIC, public, rate

router = APIRouter(prefix='/api/auth', tags=['wechat-membership'])

class WechatLogin(BaseModel):
    code: str = Field(min_length=1, max_length=256)

def configured():
    return bool(os.getenv('BEEEVAL_WECHAT_APPID') and os.getenv('BEEEVAL_WECHAT_APP_SECRET'))

async def verified_openid(code):
    if not configured():
        raise HTTPException(503, detail='微信注册尚未配置，请先使用现有 BeeEVAL 账号登录')
    # This API carries credentials in its query: suppress HTTP client URL logs.
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    # OpenID must come from WeChat's server, never from a client-provided identity.
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            response = await client.get('https://api.weixin.qq.com/sns/jscode2session', params={
                'appid': os.environ['BEEEVAL_WECHAT_APPID'],
                'secret': os.environ['BEEEVAL_WECHAT_APP_SECRET'],
                'js_code': code, 'grant_type': 'authorization_code'})
            response.raise_for_status()
            result = response.json()
    except Exception:
        raise HTTPException(503, detail='微信账号服务暂时不可用，请重试') from None
    if not isinstance(result,dict) or result.get('errcode') or not isinstance(result.get('openid'), str) or not result['openid']:
        raise HTTPException(401, detail='微信登录凭证无效或已过期，请重新点击登录')
    return result['openid']

@router.post('/wechat-login')
async def login(req: WechatLogin, request: Request):
    rate('wechat-ip:' + str(request.client.host), 30)
    openid = await verified_openid(req.code)
    appid = os.environ['BEEEVAL_WECHAT_APPID']
    # Unique identity and user insertion are serialized within one SQL transaction.
    key = appid + ':' + openid
    username = 'wx_' + hashlib.sha256(key.encode()).hexdigest()[:40]
    password = hash_password(secrets.token_urlsafe(48))
    fields = ', '.join('u.' + field.strip() for field in PUBLIC.split(','))
    try:
        rows = supabase.raw_sql(f'''
      WITH guard AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))),
      existing AS MATERIALIZED (
        SELECT {fields} FROM users u JOIN member_wechat_identities w ON w.user_id=u.id
        CROSS JOIN guard WHERE w.app_id=%s AND w.open_id=%s
      ), created AS (
        INSERT INTO users(username,password_hash,role,membership_tier,display_name,is_active,status,must_reset_pwd,password_version)
        SELECT %s,%s,'viewer','free','微信用户',TRUE,'active',FALSE,1 FROM guard
        WHERE NOT EXISTS (SELECT 1 FROM existing) RETURNING {PUBLIC}
      ), linked AS (
        INSERT INTO member_wechat_identities(app_id,open_id,user_id)
        SELECT %s,%s,id FROM created RETURNING user_id
      ) SELECT *,FALSE AS newly_registered FROM existing
        UNION ALL SELECT *,TRUE AS newly_registered FROM created
        ''', [key, appid, openid, username, password, appid, openid]).data
    except Exception:
        # A concurrent first login may win the unique identity constraint. The
        # failed statement rolls back its user insert; resolve only that identity.
        rows = supabase.raw_sql(f'SELECT {fields}, FALSE AS newly_registered FROM users u JOIN member_wechat_identities w ON w.user_id=u.id WHERE w.app_id=%s AND w.open_id=%s', [appid,openid]).data
        if not rows: raise HTTPException(503, detail='微信注册暂未完成，请稍后重试') from None
    if not rows:
        raise HTTPException(503, detail='微信注册暂未完成，请重试')
    row = rows[0]
    if not row.get('is_active'):
        raise HTTPException(403, detail='账号已停用')
    expiry = row.get('expires_at')
    if expiry:
        expiry = datetime.fromisoformat(expiry.replace('Z','+00:00')) if isinstance(expiry,str) else expiry
        if expiry.tzinfo is None: expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry <= datetime.now(timezone.utc): raise HTTPException(403, detail='账号已到期')
    if row.get('must_reset_pwd'):
        raise HTTPException(403, detail='请先在 BeeEVAL 平台完成账号密码初始化')
    token = issue_token(user_id=int(row['id']), username=row['username'], role=row['role'], password_version=int(row['password_version']))
    user = public(row)
    user.pop('newly_registered', None)
    # Preserve paid entitlements for a returning linked user.
    user['report_entitlements'] = [r['report_key'] for r in supabase.raw_sql(
        'SELECT report_key FROM user_report_entitlements WHERE user_id=%s AND (expires_at IS NULL OR expires_at>NOW())', [row['id']]).data]
    return {'access_token': token, 'user': user, 'registered': bool(row['newly_registered'])}

# Authenticated, fixed homepage projection. It deliberately has no search,
# pagination, ASR, response, metric details, evidence paths or video URLs.
import time
import threading
from fastapi import Depends
from api.auth.deps import _resolve_current_user
_HOME_LOCK = threading.Lock()
_HOME_CACHE = None
_HOME_AT = 0.0

@router.get('/mini-home')
def mini_home(request: Request, user: dict = Depends(_resolve_current_user)):
    if user.get('must_reset_pwd'):
        raise HTTPException(403, detail='请先完成账号密码初始化')
    if request.query_params:
        raise HTTPException(403, detail='首页预览不支持搜索或翻页，请升级会员')
    global _HOME_CACHE, _HOME_AT
    with _HOME_LOCK:
        if _HOME_CACHE is not None and time.monotonic() - _HOME_AT < 60:
            return _HOME_CACHE
        # Same inclusion rules as the existing scored vehicle list.
        where = """vr.metadata->>'analysis_source'='mimo-v2.5'
          AND vr.metadata->>'status'='completed'
          AND COALESCE((vr.metadata->>'needs_review')::boolean,false)=false
          AND vr.brand_model NOT ILIKE '%%大众%%' AND vr.brand_model NOT ILIKE '%%volkswagen%%'
          AND EXISTS(SELECT 1 FROM test_case_pool tcp WHERE tcp.case_id=vr.case_id)"""
        vehicles = supabase.raw_sql('''SELECT vr.brand_model,vr.system_version,
          COUNT(DISTINCT vr.case_id) AS video_count,MAX(vos.overall_score) AS overall_score
          FROM video_results vr LEFT JOIN vehicle_overall_scores vos
          ON vos.brand_model=vr.brand_model AND vos.system_version IS NOT DISTINCT FROM vr.system_version
          WHERE '''+where+''' GROUP BY vr.brand_model,vr.system_version
          ORDER BY vr.brand_model,vr.system_version''').data
        records = supabase.raw_sql('''SELECT vr.id,vr.case_id,vr.brand_model,
          vr.system_version,vr.function_domain,
          CASE WHEN vr.metadata->>'task_success'='true' THEN true
               WHEN vr.metadata->>'task_success'='false' THEN false ELSE NULL END AS task_success
          FROM video_results vr WHERE '''+where+''' ORDER BY vr.case_id,vr.brand_model,vr.id LIMIT 6''').data
        # Explicit output allowlists also protect against future query changes.
        cars=[{k:r.get(k) for k in ('brand_model','system_version','video_count','overall_score')} for r in vehicles]
        cards=[{k:r.get(k) for k in ('id','case_id','brand_model','system_version','function_domain','task_success')} for r in records]
        _HOME_CACHE={'vehicles':cars,'records':cards,'fetchedAt':datetime.now(timezone.utc).isoformat(),'preview':True}
        _HOME_AT=time.monotonic()
        return _HOME_CACHE

@router.get('/mini-preview-case')
def mini_preview_case(request: Request, id: str, user: dict = Depends(_resolve_current_user)):
    home=mini_home(Request({'type':'http','query_string':b''}),user)
    if set(request.query_params.keys())!={'id'} or id not in {str(r['id']) for r in home['records']}:
        raise HTTPException(403, detail='这条用例不在首页免费体验范围，请升级会员')
    rows=supabase.raw_sql('''SELECT id,case_id,brand_model,system_version,function_domain,
      jsonb_build_object('user_question',metadata->>'user_question','system_response',metadata->>'system_response',
      'task_success',metadata->'task_success','test_date',metadata->>'test_date') AS metadata
      FROM video_results WHERE id=%s''',[id]).data
    if not rows:raise HTTPException(404,detail='用例不存在')
    row=rows[0]
    row['evaluation_scores']=supabase.raw_sql('SELECT criteria,score,feedback FROM evaluation_scores WHERE result_id=%s ORDER BY id',[id]).data
    return row

@router.get('/mini-preview-vehicle')
def mini_preview_vehicle(request: Request, brand_model: str, system_version: str='', user: dict = Depends(_resolve_current_user)):
    home=mini_home(Request({'type':'http','query_string':b''}),user)
    if set(request.query_params.keys())-{'brand_model','system_version'} or not any(r['brand_model']==brand_model and (r['system_version'] or '')==system_version for r in home['vehicles']):
        raise HTTPException(403,detail='该车型不在首页体验范围，请升级会员')
    rows=supabase.raw_sql('''SELECT aggregation_type AS dimension_type,dimension_key,avg_score,sample_count
       FROM vehicle_aggregated_scores WHERE brand_model=%s AND system_version IS NOT DISTINCT FROM %s
       ORDER BY aggregation_type,dimension_key''',[brand_model,system_version or None]).data
    return {'dimensions':rows,'preview':True}
