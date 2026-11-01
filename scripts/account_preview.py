"""Loopback-only interactive account preview. No production connections or emails."""
import io,json,os,secrets,time,hashlib,hmac
from pathlib import Path
from http.server import ThreadingHTTPServer
os.environ.setdefault('PREVIEW_ROOT',str(Path(__file__).resolve().parents[1]/'site'))
os.environ.setdefault('PREVIEW_STATE_DIR',str(Path(__file__).resolve().parents[1]/'.local/account-redesign'))
import preview as p

def init():
    p.init()
    with p.conn() as db:
        cols=[r[1]for r in db.execute('PRAGMA table_info(members)')]
        if 'scenario_enabled' not in cols:db.execute('ALTER TABLE members ADD COLUMN scenario_enabled INTEGER NOT NULL DEFAULT 0')
        db.execute('CREATE TABLE IF NOT EXISTS resets(contact TEXT PRIMARY KEY,user_id INTEGER,challenge TEXT,hash TEXT,expires REAL,attempts INTEGER,sent REAL,consumed INTEGER DEFAULT 0)')
        for tier,name,scene in [('free','体验研究员',0),('plus','产品研究员',1),('trial','试用研究员',0)]:
            salt=secrets.token_hex(16)
            db.execute('INSERT OR IGNORE INTO members(username,contact,channel,nickname,hash,salt,tier,scenario_enabled) VALUES(?,?,?,?,?,?,?,?)',
              (tier,f'{tier}@preview.example','email',name,p.password_hash('BeeEVAL2026',salt),salt,tier,scene))
old_public=p.public
def public(row):
    user=old_public(row);user['capabilities']['scenarios']=bool(row['scenario_enabled']);user['is_active']=True
    return user
p.public=public

class Handler(p.Handler):
    def issue(self,user):
        token=secrets.token_urlsafe(32);p.SESSIONS[token]=(user['id'],time.time()+604800)
        remember=self.payload.get('remember_me') is True
        return self.json(200,{'user':user},'beeeval_preview_session='+token+'; Path=/; HttpOnly; SameSite=Lax'+('; Max-Age=604800'if remember else ''))
    def json(self,status,data,cookie=None):
        if status==200 and self.path in ('/api/register-code','/api/password-reset-code') and data.get('challenge'):
            proof=p.PRIVATE/('reset-code.txt'if self.path.endswith('password-reset-code')else'verification-code.txt')
            if proof.exists():
                value=json.loads(proof.read_text())
                if value.get('challenge')==data['challenge']:data={**data,'preview':True,'demo_code':value['code']}
        return super().json(status,data,cookie)
    def do_POST(self):
        if self.headers.get('Origin')!='http://'+self.headers.get('Host',''):return self.json(403,{'error':'请求来源不匹配'})
        if not self.headers.get('Content-Type','').startswith('application/json'):return self.json(415,{'error':'请使用 JSON 请求'})
        try:length=int(self.headers.get('Content-Length','0'))
        except ValueError:return self.json(400,{'error':'无效请求'})
        if length<0 or length>20000:return self.json(413,{'error':'内容过长'})
        raw=self.rfile.read(length)
        try:self.payload=json.loads(raw or b'{}')
        except Exception:return self.json(400,{'error':'无效请求'})
        if not isinstance(self.payload,dict):return self.json(400,{'error':'无效请求'})
        if self.path=='/api/password-reset-code':return self.reset_code()
        if self.path=='/api/password-reset':return self.reset_password()
        stream=self.rfile;self.rfile=io.BytesIO(raw)
        try:return super().do_POST()
        finally:self.rfile=stream
    def reset_code(self):
        target=self.payload.get('recipient','')
        if not isinstance(target,str)or not p.re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',target)or len(target)>254:return self.json(400,{'error':'请输入有效的注册邮箱'})
        target=target.strip().lower();now=time.time();challenge=secrets.token_urlsafe(24);otp=str(secrets.randbelow(1000000)).zfill(6)
        with p.conn()as db:
            previous=db.execute('SELECT sent FROM resets WHERE contact=?',(target,)).fetchone()
            if previous and now-previous['sent']<60:return self.json(429,{'error':'请等待60秒后重新获取验证码'})
            user=db.execute('SELECT id FROM members WHERE contact=?',(target,)).fetchone()
            db.execute('INSERT OR REPLACE INTO resets VALUES(?,?,?,?,?,0,?,0)',(target,user['id']if user else None,challenge,hashlib.sha256(('reset:'+challenge+otp).encode()).hexdigest(),now+300,now))
        if user:
            f=p.PRIVATE/'reset-code.txt';f.write_text(json.dumps({'recipient':target,'challenge':challenge,'code':otp}));os.chmod(f,0o600)
        return self.json(200,{'challenge':challenge,'expires_in':300,'retry_after':60})
    def reset_password(self):
        target=str(self.payload.get('recipient','')).strip().lower();challenge=str(self.payload.get('challenge',''));code=str(self.payload.get('code',''));password=self.payload.get('password')
        if not p.valid_password(password):return self.json(400,{'error':'密码至少10位并包含字母和数字'})
        with p.LOCK,p.conn()as db:
            row=db.execute('SELECT * FROM resets WHERE contact=? AND challenge=?',(target,challenge)).fetchone()
            if not row or row['consumed']or row['expires']<time.time()or row['attempts']>=5:return self.json(400,{'error':'验证码错误、过期或已使用，请重新验证。'})
            db.execute('UPDATE resets SET attempts=attempts+1 WHERE contact=?',(target,));db.commit()
            if row['user_id']is None or not hmac.compare_digest(row['hash'],hashlib.sha256(('reset:'+challenge+code).encode()).hexdigest()):return self.json(400,{'error':'验证码错误、过期或已使用，请重新验证。'})
            salt=secrets.token_hex(16);db.execute('UPDATE members SET hash=?,salt=? WHERE id=?',(p.password_hash(password,salt),salt,row['user_id']));db.execute('UPDATE resets SET consumed=1 WHERE contact=?',(target,))
        for token,session in list(p.SESSIONS.items()):
            if session[0]==row['user_id']:p.SESSIONS.pop(token,None)
        return self.json(200,{'ok':True},'beeeval_preview_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')

if __name__=='__main__':
    init();ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('PREVIEW_PORT','8790'))),Handler).serve_forever()
