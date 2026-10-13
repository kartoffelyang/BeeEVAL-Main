from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text();s="import {sharedIdentity} from './identity.mjs';\n"+s
old=" const user=cookie?db.prepare('SELECT u.id,u.username,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(digest(cookie),Date.now()):null;"
assert old in s
s=s.replace(old," const shared=await sharedIdentity(req,db);\n const user=shared===undefined?(cookie?db.prepare('SELECT u.id,u.username,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(digest(cookie),Date.now()):null):shared;")
p.write_text(s)
