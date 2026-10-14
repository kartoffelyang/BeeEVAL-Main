"""Local-only preview with a fixture identity and server-enforced private routes."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit, quote, unquote
import posixpath
import json, secrets, time

ROOT = str(Path(__file__).resolve().parents[1] / 'dist')
SESSIONS = {}
ATTEMPTS = {}
USER = {'id':'local-admin','username':'admin','role':'admin','capabilities':{'reports':True,'scenarios':True,'benchmark':True,'level':'full'}}

class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs): super().__init__(*args,directory=ROOT,**kwargs)
 def user(self):
  cookie=SimpleCookie()
  try: cookie.load(self.headers.get('Cookie',''))
  except Exception: return None
  token=cookie.get('beeeval_preview_session')
  return USER if token and SESSIONS.get(token.value,0)>time.time() else None
 def json(self,status,data,cookie=None):
  raw=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)))
  if cookie: self.send_header('Set-Cookie',cookie)
  self.end_headers();self.wfile.write(raw)
 def redirect(self,path):
  self.send_response(302);self.send_header('Location',path);self.send_header('Cache-Control','no-store');self.end_headers()
 def do_POST(self):
  if self.headers.get('Origin') != 'http://'+self.headers.get('Host',''):return self.json(403,{'error':'请求来源不匹配'})
  if not self.headers.get('Content-Type','').startswith('application/json'):return self.json(415,{'error':'请使用JSON请求'})
  length=int(self.headers.get('Content-Length','0'))
  if length>4096:return self.json(413,{'error':'内容过长'})
  try: body=json.loads(self.rfile.read(length) or b'{}')
  except Exception:return self.json(400,{'error':'无效请求'})
  if self.path=='/main/api/logout':
   c=SimpleCookie(self.headers.get('Cookie',''));token=c.get('beeeval_preview_session')
   if token:SESSIONS.pop(token.value,None)
   return self.json(200,{'ok':True},'beeeval_preview_session=; Path=/main/; HttpOnly; SameSite=Lax; Max-Age=0')
  if self.path!='/main/api/login':return self.json(404,{'error':'接口不存在'})
  ip=self.client_address[0];recent=[t for t in ATTEMPTS.get(ip,[]) if time.time()-t<900]
  if len(recent)>=20:return self.json(429,{'error':'尝试过于频繁，请稍后再试'})
  ATTEMPTS[ip]=recent+[time.time()]
  if body.get('username')!='admin' or body.get('password')!='admin':return self.json(401,{'error':'用户名或密码不正确'})
  token=secrets.token_urlsafe(32);SESSIONS[token]=time.time()+604800
  self.json(200,{'user':USER},'beeeval_preview_session='+token+'; Path=/main/; HttpOnly; SameSite=Lax; Max-Age=604800')
 def do_GET(self):
  parts=urlsplit(self.path);path=posixpath.normpath(unquote(parts.path));
  self.path=path+("/" if parts.path.endswith("/") and not path.endswith("/") else "")+("?"+parts.query if parts.query else "")
  if path=='/main/api/session':return self.json(200,{'user':self.user()})
  if path.startswith('/scene/api/'):
   if path.endswith('/session'):return self.json(200,{'user':self.user(),'generationEnabled':False})
   return self.json(200,{'scenes':[]}) if self.user() else self.json(401,{'error':'请先登录'})
  if (path=='/main/reports' or path.startswith('/main/reports/')) and not self.user():return self.redirect('/main/preview.html?path='+quote(self.path,safe=''))
  if (path=='/main/scenes/library' or path.startswith('/main/scenes/library/')) and not self.user():return self.redirect('/main/preview.html?product=scenes&path='+quote(self.path,safe=''))
  if self.path.startswith('/main/'):
   self.path=self.path[5:];return super().do_GET()
  self.redirect('/main/')
 def end_headers(self):
  self.send_header('Cache-Control','no-store' if self.path.startswith(('/reports/','/scenes/library/')) else 'no-cache')
  self.send_header('X-Content-Type-Options','nosniff');super().end_headers()

if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',8771),Handler).serve_forever()
