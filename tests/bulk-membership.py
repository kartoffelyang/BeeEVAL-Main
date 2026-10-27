"""Provisioning contract tests. SMTP is intercepted; no messages or accounts are created."""
import ast,asyncio,importlib.util,io,re,sys,types,unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta
from typing import Optional,Literal,List
from pydantic import BaseModel,Field,ValidationError
from fastapi import HTTPException
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'integrations/evaluation'))
mail=types.ModuleType('api.services.email_service');mail.is_valid_email=lambda s:bool(re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+',s))
for name in ('api','api.services'):sys.modules.setdefault(name,types.ModuleType(name))
sys.modules['api.services.email_service']=mail
import bulk_provision as bulk
from account_invite import render_invite_email
from apply_bulk_membership import patch
class DB:
 def __init__(self):self.rows=[];self.duplicate=False;self.fail=False
 def raw_sql(self,q,p):
  if q.startswith('SELECT id FROM users'):return types.SimpleNamespace(data=[{'id':1}] if self.duplicate else [])
  if self.fail:raise RuntimeError('database failed')
  self.rows.append((q,p));return types.SimpleNamespace(data=[{'id':77}])
class Tests(unittest.TestCase):
 def test_parse(self):
  parsed=bulk.parse_csv(('邮箱,姓名,角色,会员等级,场景库授权,部门,有效天数\n'
   'trial@example.com,试用,会员,Trial,不开放,产品,7\n'
   'plus@example.com,付费,member,Plus,开放,研发,永久\n'
   'admin@example.com,管理员,管理员,,,管理,\n'
   'free@example.com,,,,,,\n'
   'bad@example.com,,analyst,Max,maybe,,7.5\n'
   'trial@example.com,,会员,Free,不开放,,\n').encode())
  self.assertEqual((parsed.total,parsed.valid,parsed.invalid),(6,4,2))
  a,b,c,d,e,f=parsed.rows
  self.assertEqual((a.role,a.membership_tier,a.scenario_enabled,a.expires_days),('viewer','trial',False,7))
  self.assertEqual((b.membership_tier,b.scenario_enabled,b.expires_days),('plus',True,0))
  self.assertIsNone(c.membership_tier);self.assertTrue(c.scenario_enabled)
  self.assertEqual(d.membership_tier,'free');self.assertFalse(d.scenario_enabled)
  for err in ('role_invalid','membership_tier_invalid','scenario_enabled_invalid','expires_days_invalid'):self.assertIn(err,e.error)
  self.assertEqual(f.error,'duplicate_in_file')
  for v in ('nan','inf','-1','3651'):self.assertIsNotNone(bulk._parse_expires_days_cell(v)[1])
 def test_template(self):
  from openpyxl import load_workbook
  wb=load_workbook(io.BytesIO(bulk.build_template_xlsx()))
  self.assertEqual([c.value for c in wb.worksheets[0][1]],['邮箱','姓名','角色','会员等级','场景库授权','部门','有效天数'])
  self.assertEqual(bulk.parse_upload('template.xlsx',bulk.build_template_xlsx()).total,0)
  self.assertEqual(len(wb.worksheets[0].data_validations.dataValidation),3)
 def test_email(self):
  for lang in ('zh','en'):
   for tier in ('free','base','plus','pro','trial'):
    subject,plain,html=render_invite_email(display_name='<王>',username='test@example.com',initial_password='Test1234',role='viewer',membership_tier=tier,scenario_enabled=True,lang=lang)
    self.assertIn('https://www.beeeval.com/login.html',plain);self.assertNotIn('Dr.Bee',plain);self.assertNotIn('5 款',plain)
    self.assertIn('Test1234',plain);self.assertNotIn('<王>',html);self.assertIn('&lt;王&gt;',html)
    self.assertIn('Trial' if tier=='trial' else tier.capitalize(),plain)
    for body in (plain,html):
     self.assertNotIn('场景库',body);self.assertNotIn('Scenario library',body)
     if tier=='trial':
      self.assertNotIn('汇总得分',body);self.assertNotIn('rankings',body)
      self.assertIn('试用账号仅开放出行域。' if lang=='zh' else 'Trial accounts only have access to the travel domain.',body)
    if lang=='zh':self.assertEqual(subject,'【BeeEVAL】账号开通')
 def test_commit(self):
  source=Path(sys.argv[1]).read_text();patched=patch(source);self.assertEqual(patch(patched),patched)
  nodes=[n for n in ast.parse(patched).body if isinstance(n,ast.ClassDef) and n.name.startswith('Bulk') or isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name=='_create_one_and_invite']
  db=DB();sent=[]
  async def send_email(**kw):sent.append(kw)
  mail.send_email=send_email;mail.SmtpConfig=object
  ns=dict(BaseModel=BaseModel,Field=Field,Literal=Literal,Optional=Optional,List=List,datetime=datetime,timezone=timezone,timedelta=timedelta,bulk_provision=bulk,email_service=mail,supabase=db,hash_password=lambda v:'hash',PasswordTooLong=ValueError,settings=types.SimpleNamespace(APP_LOGIN_URL='old'),render_invite_email=render_invite_email,logger=types.SimpleNamespace(info=lambda *a:None,warning=lambda *a:None))
  exec(compile(ast.Module(body=nodes,type_ignores=[]),'patched','exec'),ns)
  Row=ns['BulkCommitRowIn'];create=ns['_create_one_and_invite']
  for kw in ({'role':'analyst'},{'membership_tier':'max'},{'scenario_enabled':'maybe'}):
   with self.assertRaises(ValidationError):Row(email='x@example.com',**kw)
  async def run():
   cfg=types.SimpleNamespace(configured=True)
   for tier,scene,days in [('free',False,None),('trial',False,7),('plus',True,0),('pro',False,365)]:
    r=await create(Row(email=f'{tier}@example.com',membership_tier=tier,scenario_enabled=scene,expires_days=days),smtp_cfg=cfg,email_lang='zh',skip_email=False,by_username='admin',default_expires_at=datetime.now(timezone.utc)+timedelta(days=30))
    self.assertEqual(r.status,'created');q,p=db.rows[-1];self.assertIn('WITH created',q);self.assertEqual(p[7],tier);self.assertEqual(p[10],scene)
    if days==0:self.assertIsNone(p[6])
    self.assertEqual(r.scenario_enabled,scene);self.assertIn(tier.capitalize(),sent[-1]['plain_body'])
   db.duplicate=True;count=len(sent)
   r=await create(Row(email='existing@example.com'),smtp_cfg=cfg,email_lang='zh',skip_email=False,by_username='admin');self.assertEqual(r.status,'skipped_exists');self.assertEqual(len(sent),count)
   db.duplicate=False
   async def fail(**kw):raise RuntimeError('mail unavailable')
   mail.send_email=fail
   r=await create(Row(email='failure@example.com'),smtp_cfg=cfg,email_lang='zh',skip_email=False,by_username='admin');self.assertEqual(r.status,'created_no_email')
  asyncio.run(run())
if __name__=='__main__':unittest.main(argv=[sys.argv[0]])
