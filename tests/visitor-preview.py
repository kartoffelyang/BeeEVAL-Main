"""Acceptance checks against the running local visitor preview server."""
import json, urllib.request, urllib.error, http.cookiejar
BASE='http://127.0.0.1:8771'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),NoRedirect())
def request(path,body=None,origin=BASE):
 headers={'Origin':origin}
 if body is not None:headers['Content-Type']='application/json'
 r=urllib.request.Request(BASE+path,headers=headers,data=json.dumps(body).encode() if body is not None else None)
 try: response=client.open(r)
 except urllib.error.HTTPError as e:response=e
 return response.status,response.headers,response.read().decode()
reports=json.loads(request('/main/assets/report-previews.json')[2]);assert len(reports)==7
for slug,r in reports.items():
 assert len(r['findings'])==3 and r['summary'] and r['en']['summary'] and r['outline']
 for file in ['index.html','en.html']:
  status,headers,body=request('/main/reports/'+slug+'/'+file);assert status==302 and '/main/preview.html?' in headers['Location'];assert '<h1' not in body
 assert request('/main/preview.html?report='+slug)[0]==200
products=json.loads(request('/main/assets/product-previews.json')[2]);assert len(products['platform']['samples'])==4 and len(products['scenes']['samples'])==3
assert request('/main/scenes/library/')[0]==302
assert request('/main/assets/../reports/zeekr9x/index.html')[0]==302
assert request('/main/assets/%2E%2E/reports/zeekr9x/index.html')[0]==302
assert request('/main/api/login',{'username':'admin','password':'admin'},'http://evil.example')[0]==403
assert request('/main/api/login',{'username':'admin','password':'incorrect'})[0]==401
status,headers,body=request('/main/api/login',{'username':'admin','password':'admin'});assert status==200 and 'HttpOnly' in headers['Set-Cookie']
assert json.loads(request('/main/api/session')[2])['user']['capabilities']['reports']
for slug in reports:
 for file in ['index.html','en.html']:
  status,headers,body=request('/main/reports/'+slug+'/'+file);assert status==200 and '<h1' in body;assert 'window.print()' not in body
assert request('/main/scenes/library/')[0]==200
assert request('/main/api/logout',{})[0]==200
assert json.loads(request('/main/api/session')[2])['user'] is None
assert request('/main/reports/zeekr9x/index.html')[0]==302
assert request('/main/scenes/library/')[0]==302
print('PASS: 7 bilingual summaries, 2 product previews, guest guards, normalized-path guards, origin check, invalid password, one login, 14 full reports, full scene library and logout.')
