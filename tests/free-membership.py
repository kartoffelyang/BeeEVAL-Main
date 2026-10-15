"""End-to-end registration/profile/access tests on isolated localhost data. No real email."""
import subprocess,tempfile,os,time,json,urllib.request,urllib.error,http.cookiejar,sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1];state=Path(tempfile.mkdtemp(prefix='beeeval-members-'));port=8772;base=f'http://127.0.0.1:{port}'
app=subprocess.Popen(['python3','scripts/preview.py'],cwd=root,env=dict(os.environ,PREVIEW_PORT=str(port),PREVIEW_STATE_DIR=str(state)),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
cookies=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**kw):return None
blocked=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies),NoRedirect())
def request(path,data=None,redirect=True):
 req=urllib.request.Request(base+path,data=json.dumps(data).encode()if data is not None else None,headers={'Origin':base,'Content-Type':'application/json'})
 try:
  with (client if redirect else blocked).open(req)as response:
   raw=response.read();return response.status,json.loads(raw)if response.headers.get_content_type()=='application/json'else raw,response.headers
 except urllib.error.HTTPError as response:
  raw=response.read();return response.code,json.loads(raw)if response.headers.get_content_type()=='application/json'else raw,response.headers
try:
 for _ in range(80):
  try:request('/api/session');break
  except Exception:time.sleep(.05)
 assert request('/reports/l9livis/',redirect=False)[0]==302
 email='free.member@example.com';password='PreviewTest1234'
 status,data,_=request('/api/register-code',{'recipient':email,'channel':'email'});assert status==200
 assert 'code' not in data
 proof=json.loads((state/'verification-code.txt').read_text());assert proof['recipient']==email
 body={'recipient':email,'channel':'email','challenge':data['challenge'],'code':'bad','password':password,'display_name':'免费测试','role':'admin','membership_tier':'pro'}
 assert request('/api/register',body)[0]==400
 body['code']=proof['code'];status,data,_=request('/api/register',body);assert status==200
 assert data['user']['membership_tier']=='free' and data['user']['role']=='viewer'
 assert request('/reports/l9livis/',redirect=False)[0]==200
 assert request('/reports/l9livis/en.html',redirect=False)[0]==200
 assert request('/reports/whitepaper/',redirect=False)[0]==302
 assert request('/scenes/',redirect=False)[0]==302
 assert request('/scenes/api/scenes',redirect=False)[0]==403
 assert request('/api/register',body)[0]==400
 assert request('/api/profile',{'username':'admin','display_name':'不能冒用'})[0]==409
 assert request('/api/profile',{'username':'member_updated','display_name':'新的昵称'})[0]==200
 status,profile,_=request('/api/profile');assert profile['user']['username']=='member_updated'and profile['user']['email']==email
 request('/api/logout',{})
 assert request('/api/login',{'username':'member_updated','password':password})[0]==200
 assert request('/api/change-password',{'old_password':'wrong','new_password':'NewPassword1234'})[0]==400
 assert request('/api/change-password',{'old_password':password,'new_password':'NewPassword1234'})[0]==200
 assert request('/api/session')[1]['user']is None
 assert request('/api/login',{'username':'member_updated','password':password})[0]==401
 assert request('/api/login',{'username':'member_updated','password':'NewPassword1234'})[0]==200
 print('PASS: verified signup, OTP secrecy/replay, privilege spoof blocked, free reports in both languages, paid reports/scenes denied, profile edit, password rotation and session invalidation.')
finally:
 app.terminate();app.wait(timeout=5)
 import shutil;shutil.rmtree(state)
