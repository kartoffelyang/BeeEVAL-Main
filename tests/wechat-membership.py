"""Isolated WeChat identity tests: no real code, secret, user DB or network."""
import asyncio,importlib.util,os,sys,types,pathlib
from unittest.mock import patch
from fastapi import HTTPException
from starlette.requests import Request
ROOT=pathlib.Path(__file__).resolve().parents[1]
class DB:
 row={'id':42,'username':'fixture-wx','role':'viewer','membership_tier':'free','display_name':'微信用户','is_active':True,'must_reset_pwd':False,'password_version':1,'expires_at':None,'newly_registered':True}
 def raw_sql(self,sql,args):
  if sql.startswith('SELECT report_key'):return types.SimpleNamespace(data=[])
  assert args[1]=='fixture-app' and args[2]=='fixture-openid'
  assert "'viewer','free'" in sql
  return types.SimpleNamespace(data=[dict(self.row)])
db=DB()
def module(name,**attrs):
 m=types.ModuleType(name);m.__dict__.update(attrs);sys.modules[name]=m
for name in ['api','api.auth','api.services','api.routers']:module(name)
module('api.auth.deps',_resolve_current_user=lambda req: {})
module('api.auth.jwt_utils',issue_token=lambda **kw:'fixture-token')
module('api.auth.password',hash_password=lambda value:'fixture-hash')
module('api.services.local_db_client',supabase=db)
module('api.routers.member_accounts',PUBLIC='id, username, role, display_name, is_active, must_reset_pwd, password_version, created_at, expires_at, membership_tier, email, phone',public=lambda row:{k:v for k,v in row.items() if k!='password_version'},rate=lambda *args:None)
spec=importlib.util.spec_from_file_location('wechat_source',ROOT/'integrations/evaluation/wechat_accounts.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Client:
 result={'openid':'fixture-openid','session_key':'not-returned-or-stored'}
 def __init__(self,**kwargs):pass
 async def __aenter__(self):return self
 async def __aexit__(self,*args):pass
 async def get(self,url,params):
  assert url=='https://api.weixin.qq.com/sns/jscode2session'
  assert params['js_code']=='fixture-code' and params['secret']=='fixture-secret'
  return types.SimpleNamespace(raise_for_status=lambda:None,json=lambda:dict(self.result))
async def main():
 req=Request({'type':'http','client':('127.0.0.1',1)})
 with patch.dict(os.environ,{'BEEEVAL_WECHAT_APPID':'','BEEEVAL_WECHAT_APP_SECRET':''}):
  try:await m.verified_openid('fixture-code');assert False
  except HTTPException as e:assert e.status_code==503
 with patch.dict(os.environ,{'BEEEVAL_WECHAT_APPID':'fixture-app','BEEEVAL_WECHAT_APP_SECRET':'fixture-secret'}),patch.object(m.httpx,'AsyncClient',Client):
  result=await m.login(m.WechatLogin(code='fixture-code'),req);assert result['user']['membership_tier']=='free';assert result['registered'];assert 'session_key' not in str(result)
  db.row.update(membership_tier='plus',newly_registered=False);result=await m.login(m.WechatLogin(code='fixture-code'),req);assert result['user']['membership_tier']=='plus' and not result['registered']
  db.row['is_active']=False
  try:await m.login(m.WechatLogin(code='fixture-code'),req);assert False
  except HTTPException as e:assert e.status_code==403
  Client.result={'errcode':40029}
  try:await m.verified_openid('fixture-code');assert False
  except HTTPException as e:assert e.status_code==401
 print('PASS: configured server-only WeChat exchange, Free signup, returning paid tier preserved, disabled account blocked, invalid code blocked; isolated fixtures only')
asyncio.run(main())
