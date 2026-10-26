// Resolve the shared BeeEVAL identity while preserving existing scene ownership.
export async function sharedIdentity(req,db){
 if((req.headers.cookie||'').split(';').some(s=>s.trim()==='beeeval_signed_out=1'))return null;
 const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('beeeval_session='))?.slice(16);
 if(!token)return undefined;
 const r=await fetch('https://open.beeeval.com/api/auth/me',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
 if(!r.ok){if(r.status>=500)throw Error('账号服务暂时不可用');return null}
 const identity=await r.json();
 if(identity.role!=='admin'&&!identity.report_entitlements?.includes('scenarios'))return null;
 const existingAdmin=identity.username==='admin'&&identity.role==='admin'?db.prepare('SELECT id FROM users WHERE username=?').get('admin'):null;
 const id=existingAdmin?.id||`beeeval:${identity.id}`;
 let user=db.prepare('SELECT id,username,role FROM users WHERE id=?').get(id);
 if(!user){const username=`beeeval_${identity.id}`;db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,username,'!external',identity.role==='admin'?'admin':'user');user={id,username,role:identity.role==='admin'?'admin':'user'}}
 // Permissions always come from the validated platform identity, not the old role.
 return {...user,username:identity.username,role:identity.role==='admin'?'admin':'user'};
}
