"""Exercise real recovery handlers with an in-memory DB/SMTP boundary. No network."""
import asyncio,ast,hashlib,hmac,importlib.util,inspect,pathlib,re,secrets,sys,types
from fastapi import HTTPException
from pydantic import BaseModel,Field
from starlette.requests import Request
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name,**attrs):
    m=types.ModuleType(name);m.__dict__.update(attrs);sys.modules[name]=m;return m
for name in ['api','api.auth','api.services','api.routers']:module(name)
def recipient(channel,value):
    target=value.strip().lower()
    if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',target):raise HTTPException(400)
    return target
def digest(challenge,code):return hmac.new(b'fixture-key',(challenge+':'+code).encode(),hashlib.sha256).hexdigest()
class DB:
    row=None;known=True;clock=0;changed=0;signup=False
    def raw_sql(self,sql,args):
        out=[]
        if sql.startswith('SELECT id FROM users'):out=[{'id':42}]if self.known else []
        elif sql.startswith('INSERT INTO member_verifications'):out=[{'challenge':args[2]}]
        elif sql.startswith('INSERT INTO member_password_resets'):
            if not self.row or self.clock-self.row['sent']>=60:
                self.row=dict(target=args[0],user_id=args[1],challenge=args[2],code_hash=args[3],attempts=0,consumed=False,sent=self.clock,expires=self.clock+300);out=[{'challenge':args[2]}]
        elif sql.startswith('UPDATE member_password_resets SET attempts'):
            r=self.row
            if r and args==[r['target'],r['challenge']] and not r['consumed'] and r['expires']>self.clock and r['attempts']<5:r['attempts']+=1;out=[dict(r)]
        elif sql.startswith('WITH proof'):
            r=self.row
            if r and args[:2]==[r['target'],r['challenge']]and not r['consumed']and r['expires']>self.clock:r['consumed']=True;self.changed+=1;out=[{'id':r['user_id']}]
        elif sql.startswith('DELETE FROM member_password_resets'):self.row=None
        else:raise AssertionError(sql[:100])
        return types.SimpleNamespace(data=out)
db=DB();sent=[];configured=True
async def send_email(*,to_addr,subject,plain_body,**kwargs):sent.append(dict(to_addr=to_addr,subject=subject,plain_body=plain_body))
module('api.routers.member_accounts',recipient=recipient,digest=digest,rate=lambda *args:None)
module('api.services.local_db_client',supabase=db)
mail=module('api.services.email_service',send_email=send_email,get_smtp_config=lambda:types.SimpleNamespace(configured=configured))
module('api.auth.password',hash_password=lambda value:'hashed:'+value)
spec=importlib.util.spec_from_file_location('recovery',ROOT/'integrations/evaluation/password_recovery.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
request=Request({'type':'http','client':('127.0.0.1',1)})
async def main():
    global configured
    code=await m.send_reset_code(m.RecoveryCode(recipient='Owner@Example.com'),request)
    assert set(code)=={'challenge','expires_in','retry_after'} and len(sent)==1
    otp=re.search(r'\b\d{6}\b',sent[-1]['plain_body'])[0]
    try:await m.send_reset_code(m.RecoveryCode(recipient='owner@example.com'),request);assert False
    except HTTPException as e:assert e.status_code==429
    payload=dict(recipient='owner@example.com',challenge=code['challenge'],password='NewPassword2026')
    for i in range(5):
        try:m.reset_password(m.RecoveryReset(**payload,code='999999'if otp!='999999'else'888888'));assert False
        except HTTPException as e:assert e.status_code==400
    try:m.reset_password(m.RecoveryReset(**payload,code=otp));assert False
    except HTTPException:pass
    assert db.changed==0
    db.clock+=61
    code=await m.send_reset_code(m.RecoveryCode(recipient='owner@example.com'),request)
    otp=re.search(r'\b\d{6}\b',sent[-1]['plain_body'])[0];payload['challenge']=code['challenge']
    assert m.reset_password(m.RecoveryReset(**payload,code=otp))=={'ok':True} and db.changed==1
    try:m.reset_password(m.RecoveryReset(**payload,code=otp));assert False
    except HTTPException:pass
    db.clock+=61;db.known=False;count=len(sent)
    unknown=await m.send_reset_code(m.RecoveryCode(recipient='unknown@example.com'),request)
    assert set(unknown)==set(code)and len(sent)==count
    db.clock+=61;db.known=True;configured=False
    try:await m.send_reset_code(m.RecoveryCode(recipient='owner@example.com'),request);assert False
    except HTTPException as e:assert e.status_code==503
    # The existing signup sender must work with the SMTP service's keyword-only API.
    tree=ast.parse((ROOT/'integrations/evaluation/member_accounts.py').read_text());node=next(x for x in tree.body if isinstance(x,ast.AsyncFunctionDef)and x.name=='code');node.decorator_list=[]
    ns=dict(CodeRequest=object,Request=Request,recipient=recipient,options=lambda:{'email':True},rate=lambda *a:None,secrets=secrets,supabase=db,digest=digest,HTTPException=HTTPException,inspect=inspect,asyncio=asyncio,send_email=send_email)
    exec(compile(ast.Module(body=[node],type_ignores=[]),'signup-code','exec'),ns)
    response=await ns['code'](types.SimpleNamespace(channel='email',recipient='signup@example.com'),request)
    assert response['challenge']and sent[-1]['subject']=='BeeEVAL 注册验证码'
    print('PASS real handlers: keyword-only SMTP, five-attempt limit, cooldown, one-use reset, unknown-address generic response, SMTP unavailable; no real mail or DB')
asyncio.run(main())
