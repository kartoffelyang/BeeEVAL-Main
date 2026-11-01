"""Local account journeys on isolated SQLite state; never contacts production or mail."""
import http.cookiejar,json,os,subprocess,tempfile,time,urllib.request,urllib.error,sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='beeeval-identity-test-') as state:
    port=8791;base=f'http://127.0.0.1:{port}'
    app=subprocess.Popen(['python3','scripts/account_preview.py'],cwd=root,env=dict(os.environ,PREVIEW_PORT=str(port),PREVIEW_STATE_DIR=state),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    def req(path,body=None):
        request=urllib.request.Request(base+path,data=json.dumps(body).encode()if body is not None else None,headers={'Origin':base,'Content-Type':'application/json'})
        try:r=client.open(request)
        except urllib.error.HTTPError as e:r=e
        with r:
            raw=r.read();data=json.loads(raw)if r.headers.get_content_type()=='application/json'else raw
            return r.status,data,r.headers
    try:
        for _ in range(100):
            try:req('/api/session');break
            except Exception:time.sleep(.05)
        assert req('/login.html')[0]==200 and req('/account.html')[0]==200
        assert req('/api/registration-options')[1]['phone'] is False
        assert req('/api/register-code',{'channel':'phone','recipient':'13800000000'})[0]==400
        email='journey@preview.example';password='LocalOnly2026'
        _,code,_=req('/api/register-code',{'channel':'email','recipient':email})
        assert code['preview']and len(code['demo_code'])==6
        signup={'channel':'email','recipient':email,'code':code['demo_code'],'challenge':code['challenge'],'password':password,'display_name':'本地研究员','membership_tier':'pro','role':'admin'}
        status,user,_=req('/api/register',signup)
        assert status==200 and user['user']['membership_tier']=='free' and user['user']['role']=='viewer'
        assert not user['user']['capabilities']['scenarios']
        assert req('/api/register',signup)[0]==400
        print('PASS email registration, Free entitlement, phone disabled and signup proof single-use')
        assert req('/api/profile',{'username':'journey','display_name':'新的昵称'})[0]==200
        assert req('/api/profile')[1]['user']['email']==email
        req('/api/logout',{})
        r,_,headers=req('/api/login',{'username':'journey','password':password,'remember_me':False});assert r==200 and 'Max-Age'not in headers['Set-Cookie']
        req('/api/logout',{})
        r,_,headers=req('/api/login',{'username':'journey','password':password,'remember_me':True});assert r==200 and 'Max-Age=604800'in headers['Set-Cookie']
        print('PASS profile save, session-cookie login and persistent-cookie login')
        _,reset,_=req('/api/password-reset-code',{'recipient':email})
        assert req('/api/password-reset-code',{'recipient':email})[0]==429
        payload={'recipient':email,'challenge':reset['challenge'],'code':'000000'if reset['demo_code']!='000000'else'111111','password':'NewLocal2026'}
        assert req('/api/password-reset',payload)[0]==400
        payload['code']=code['demo_code'];assert req('/api/password-reset',payload)[0]==400
        payload['code']=reset['demo_code'];assert req('/api/password-reset',payload)[0]==200
        assert req('/api/session')[1]['user']is None
        assert req('/api/password-reset',payload)[0]==400
        assert req('/api/login',{'username':'journey','password':password})[0]==401
        assert req('/api/login',{'username':'journey','password':'NewLocal2026'})[0]==200
        _,unknown,_=req('/api/password-reset-code',{'recipient':'unknown@preview.example'})
        assert 'demo_code'not in unknown and len(unknown['challenge'])>16
        print('PASS recovery cooldown, wrong/purpose-separated code, password reset, revoked session, replay denial, unknown-address generic response')
        for path in ['/identity-auth.js','/identity-common.js','/account.js','/identity.css']:
            assert req(path)[0]==200,path
        print('ALL LOCAL ACCOUNT JOURNEYS PASSED; no real account or mail modified')
    finally:app.terminate();app.wait(timeout=5)
