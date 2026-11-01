"""Local preview: persistent test accounts; OTPs saved privately, never emailed or returned."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit,quote,unquote
import posixpath,json,secrets,time,sqlite3,hashlib,hmac,re,os,threading
BASE=Path(__file__).resolve().parents[1];ROOT=os.environ.get('PREVIEW_ROOT',str(BASE/'dist'));PRIVATE=Path(os.environ.get('PREVIEW_STATE_DIR',str(BASE/'.local')));PRIVATE.mkdir(exist_ok=True)
DB=PRIVATE/'preview-members.sqlite';SESSIONS={};ATTEMPTS={};LOCK=threading.Lock()
USER={'id':'local-admin','username':'admin','display_name':'admin','role':'admin','membership_tier':'admin','capabilities':{'reports':True,'freeReports':True,'scenarios':True,'benchmark':True,'level':'admin'}}
def conn():
 d=sqlite3.connect(DB);d.row_factory=sqlite3.Row;return d
def init():
 with conn()as d:
  d.execute('CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY,username TEXT UNIQUE,contact TEXT UNIQUE,channel TEXT,nickname TEXT,hash TEXT,salt TEXT)')
  if 'tier' not in [r[1]for r in d.execute('PRAGMA table_info(members)')]:d.execute("ALTER TABLE members ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'")
  d.execute('CREATE TABLE IF NOT EXISTS codes(contact TEXT PRIMARY KEY,challenge TEXT,hash TEXT,expires REAL,attempts INTEGER,sent REAL)')
 os.chmod(DB,0o600)
def public(row):
 tier=row['tier'];return {'id':row['id'],'username':row['username'],'display_name':row['nickname'],'email':row['contact']if row['channel']=='email'else None,'phone':row['contact']if row['channel']=='phone'else None,'role':'viewer','membership_tier':tier,'capabilities':{'reports':tier in ('base','plus','pro'),'freeReports':True,'scenarios':tier in ('base','plus','pro'),'benchmark':tier in ('plus','pro'),'level':tier}}

def password_hash(password,salt):return hashlib.pbkdf2_hmac('sha256',password.encode(),salt.encode(),200000).hex()
def valid_password(value):return isinstance(value,str)and 10<=len(value)<=128 and re.search('[A-Za-z]',value)and re.search('[0-9]',value)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=ROOT,**kwargs)
 def user(self):
  cookie=SimpleCookie()
  try:cookie.load(self.headers.get('Cookie',''))
  except Exception:return None
  token=cookie.get('beeeval_preview_session');session=SESSIONS.get(token.value) if token else None
  if not session or session[1]<time.time():return None
  if session[0]=='local-admin':return USER
  with conn()as d:row=d.execute('SELECT * FROM members WHERE id=?',(session[0],)).fetchone()
  return public(row) if row else None
 def json(self,status,data,cookie=None):
  raw=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)))
  if cookie:self.send_header('Set-Cookie',cookie)
  self.end_headers();self.wfile.write(raw)
 def issue(self,user):
  token=secrets.token_urlsafe(32);SESSIONS[token]=(user['id'],time.time()+604800)
  return self.json(200,{'user':user},'beeeval_preview_session='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800')
 def redirect(self,path):
  self.send_response(302);self.send_header('Location',path);self.send_header('Cache-Control','no-store');self.end_headers()
 def do_POST(self):
  if self.headers.get('Origin')!='http://'+self.headers.get('Host',''):return self.json(403,{'error':'请求来源不匹配'})
  if not self.headers.get('Content-Type','').startswith('application/json'):return self.json(415,{'error':'请使用JSON请求'})
  try:length=int(self.headers.get('Content-Length','0'))
  except ValueError:return self.json(400,{'error':'无效请求'})
  if length<0 or length>(20000 if self.path=='/api/contact' else 4096):return self.json(413,{'error':'内容过长'})
  try:body=json.loads(self.rfile.read(length)or b'{}')
  except Exception:return self.json(400,{'error':'无效请求'})
  if not isinstance(body,dict):return self.json(400,{'error':'无效请求'})
  if self.path=='/api/contact':
   name=body.get('name','');email=body.get('email','');message=body.get('message','')
   if not all(isinstance(v,str)for v in(name,email,message))or not 1<=len(name.strip())<=80 or not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',email)or not 5<=len(message.strip())<=4000 or body.get('website'):return self.json(400,{'code':'invalid_message'})
   return self.json(200,{'ok':True,'preview':True})
  if self.path=='/api/logout':
   c=SimpleCookie(self.headers.get('Cookie',''));token=c.get('beeeval_preview_session')
   if token:SESSIONS.pop(token.value,None)
   return self.json(200,{'ok':True},'beeeval_preview_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
  if self.path=='/api/register-code':
   target=body.get('recipient','');channel=body.get('channel')
   if not isinstance(target,str)or channel!='email' or len(target)>64 or not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',target):return self.json(400,{'error':'请输入有效邮箱；手机验证暂未开通'})
   target=target.strip().lower();now=time.time();bucket=('code',self.client_address[0]);recent=[t for t in ATTEMPTS.get(bucket,[])if now-t<3600]
   if len(recent)>=20:return self.json(429,{'error':'请求过于频繁'})
   ATTEMPTS[bucket]=recent+[now]
   with conn()as d:
    old=d.execute('SELECT * FROM codes WHERE contact=?',(target,)).fetchone()
    if old and now-old['sent']<60:return self.json(429,{'error':'请等待60秒后重新获取验证码'})
    challenge=secrets.token_urlsafe(24);otp=str(secrets.randbelow(1000000)).zfill(6)
    d.execute('INSERT OR REPLACE INTO codes VALUES(?,?,?,?,0,?)',(target,challenge,hashlib.sha256((challenge+otp).encode()).hexdigest(),now+300,now))
   f=PRIVATE/'verification-code.txt';fd=os.open(f,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
   with os.fdopen(fd,'w')as fp:fp.write(json.dumps({'recipient':target,'challenge':challenge,'code':otp,'expires':now+300}))
   return self.json(200,{'challenge':challenge,'expires_in':300,'retry_after':60,'preview':True})
  if self.path=='/api/register':
   target=str(body.get('recipient','')).strip().lower();challenge=str(body.get('challenge',''));code=str(body.get('code',''));pwd=body.get('password');nickname=str(body.get('display_name','')).strip()
   if not valid_password(pwd)or len(nickname)>40:return self.json(400,{'error':'密码至少10位并包含字母数字；昵称不超过40字'})
   with LOCK,conn()as d:
    row=d.execute('SELECT * FROM codes WHERE contact=?',(target,)).fetchone()
    if not row or row['challenge']!=challenge or row['expires']<time.time()or row['attempts']>=5:return self.json(400,{'error':'验证码错误或已过期'})
    d.execute('UPDATE codes SET attempts=attempts+1 WHERE contact=?',(target,));d.commit()
    if not hmac.compare_digest(row['hash'],hashlib.sha256((challenge+code).encode()).hexdigest()):return self.json(400,{'error':'验证码错误或已过期'})
    if d.execute('SELECT id FROM members WHERE contact=? OR username=?',(target,target)).fetchone():return self.json(409,{'error':'该账号已存在，请直接登录'})
    salt=secrets.token_hex(16);cursor=d.execute('INSERT INTO members(username,contact,channel,nickname,hash,salt) VALUES(?,?,?,?,?,?)',(target,target,'email',nickname,password_hash(pwd,salt),salt));d.execute('DELETE FROM codes WHERE contact=?',(target,));user=public(d.execute('SELECT * FROM members WHERE id=?',(cursor.lastrowid,)).fetchone())
   return self.issue(user)
  if self.path=='/api/profile':
   user=self.user()
   if not user:return self.json(401,{'error':'请先登录'})
   name=body.get('username');nickname=body.get('display_name')
   if not isinstance(name,str)or not re.fullmatch(r'[A-Za-z0-9_@.+-]{3,64}',name)or not isinstance(nickname,str)or len(nickname)>40:return self.json(400,{'error':'账号或昵称格式不正确'})
   if user['id']=='local-admin':return self.json(403,{'error':'本地管理员测试账号保持固定，请用注册账号验证资料修改'})
   try:
    with conn()as d:
     if name.lower()=='admin' or d.execute('SELECT id FROM members WHERE lower(username)=lower(?) AND id<>?',(name,user['id'])).fetchone():return self.json(409,{'error':'账号名称已被使用'})
     d.execute('UPDATE members SET username=?,nickname=? WHERE id=?',(name,nickname,user['id']));updated=public(d.execute('SELECT * FROM members WHERE id=?',(user['id'],)).fetchone())
   except sqlite3.IntegrityError:return self.json(409,{'error':'账号名称已被使用'})
   return self.json(200,{'user':updated})
  if self.path=='/api/change-password':
   user=self.user()
   if not user:return self.json(401,{'error':'请先登录'})
   if user['id']=='local-admin':return self.json(403,{'error':'固定测试管理员不可改密'})
   if not valid_password(body.get('new_password')):return self.json(400,{'error':'新密码至少10位，包含字母数字'})
   with conn()as d:
    row=d.execute('SELECT * FROM members WHERE id=?',(user['id'],)).fetchone()
    if not hmac.compare_digest(row['hash'],password_hash(str(body.get('old_password','')),row['salt'])):return self.json(400,{'error':'当前密码不正确'})
    salt=secrets.token_hex(16);d.execute('UPDATE members SET hash=?,salt=? WHERE id=?',(password_hash(body['new_password'],salt),salt,user['id']))
   for token,session in list(SESSIONS.items()):
    if session[0]==user['id']:SESSIONS.pop(token,None)
   return self.json(200,{'ok':True})
  if self.path!='/api/login':return self.json(404,{'error':'接口不存在'})
  ip=self.client_address[0];recent=[t for t in ATTEMPTS.get(ip,[])if time.time()-t<900]
  if len(recent)>=20:return self.json(429,{'error':'尝试过于频繁，请稍后再试'})
  ATTEMPTS[ip]=recent+[time.time()];username=body.get('username');pwd=body.get('password')
  if username=='admin'and pwd=='admin':return self.issue(USER)
  with conn()as d:row=d.execute('SELECT * FROM members WHERE lower(username)=lower(?)',(str(username),)).fetchone()
  if not row or not isinstance(pwd,str)or not hmac.compare_digest(row['hash'],password_hash(pwd,row['salt'])):return self.json(401,{'error':'用户名或密码不正确'})
  return self.issue(public(row))
 def do_GET(self):
  parts=urlsplit(self.path);path=posixpath.normpath(unquote(parts.path));self.path=path+('/' if parts.path.endswith('/')and not path.endswith('/')else '')+('?'+parts.query if parts.query else '')
  user=self.user()
  if path=='/main' or path.startswith('/main/'):
   return self.redirect(self.path.removeprefix('/main').replace('/scenes/library/','/scenes/'))
  if path=='/light' or path.startswith('/light/'):return self.redirect(self.path.replace('/light','/data',1))
  if path=='/api/session':return self.json(200,{'user':user})
  if path=='/api/profile':return self.json(200,{'user':user})if user else self.json(401,{'error':'请先登录'})
  if path=='/api/registration-options':return self.json(200,{'email':True,'phone':False,'preview':True})
  if path.startswith('/scenes/api/'):
   allowed=user and user['capabilities']['scenarios']
   if path.endswith('/session'):return self.json(200,{'user':user if allowed else None,'generationEnabled':False})
   return self.json(200,{'scenes':[]})if allowed else self.json(403,{'error':'当前会员无场景库权限'})
  if path=='/reports'or path.startswith('/reports/'):
   match=re.match(r'^/reports/([a-z0-9-]+)(?:/|$)',path);catalog=json.loads((Path(ROOT)/'assets/report-previews.json').read_text());record=catalog.get(match[1])if match else None
   if not(user and record and (user['capabilities']['reports']or record.get('access')=='free')):return self.redirect('/preview.html?path='+quote(self.path,safe=''))
  if(path=='/scenes'or path.startswith('/scenes/'))and not path.startswith('/scenes/images/')and not(user and user['capabilities']['scenarios']):return self.redirect('/preview.html?product=scenes&path='+quote(self.path,safe=''))
  if(path=='/data'or path.startswith('/data/'))and not(user and user['capabilities']['benchmark']):return self.redirect('/preview.html?product=platform')
  return super().do_GET()
 def end_headers(self):

  if self.path.startswith('/reports/'):
   self.send_header('Content-Disposition','inline');self.send_header('X-Robots-Tag','noindex, noarchive, nosnippet')
  self.send_header('Cache-Control','no-store'if self.path.startswith(('/reports/','/scenes/'))else'no-cache');self.send_header('X-Content-Type-Options','nosniff');super().end_headers()
if __name__=='__main__':init();ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('PREVIEW_PORT','8771'))),Handler).serve_forever()
