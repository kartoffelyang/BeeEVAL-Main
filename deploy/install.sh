#!/usr/bin/env bash
set -euo pipefail
release="$(readlink -f "$1")"
case "$release" in /opt/beeeval-main/releases/*) ;; *) echo 'Invalid release directory' >&2; exit 2;; esac
backup="/var/backups/beeeval-main/$(date -u +%Y%m%dT%H%M%SZ)-root-migration"
install -d -m 700 "$backup"
cp -a /etc/nginx/conf.d/d.conf "$backup/d.conf"
cp -a /etc/nginx/snippets "$backup/snippets"
for unit in beeeval-main-auth beeeval-light beescene; do cp -a "/etc/systemd/system/$unit.service" "$backup/$unit.service"; done
readlink -f /opt/beeeval-main/current > "$backup/previous-release"
readlink -f /var/www/beeeval-main > "$backup/previous-web"
python3 - "$backup/beescene.sqlite" <<'PY'
import sqlite3,sys,os
src=sqlite3.connect('file:/var/lib/beescene/beescene.sqlite?mode=ro',uri=True)
dst=sqlite3.connect(sys.argv[1]);src.backup(dst);assert dst.execute('pragma integrity_check').fetchone()[0]=='ok';dst.close();src.close();os.chmod(sys.argv[1],0o600)
PY
rollback(){
 cp -a "$backup/d.conf" /etc/nginx/conf.d/d.conf
 cp -a "$backup/snippets/." /etc/nginx/snippets/
 for unit in beeeval-main-auth beeeval-light beescene; do cp -a "$backup/$unit.service" "/etc/systemd/system/$unit.service"; done
 ln -sfn "$(cat "$backup/previous-release")" /opt/beeeval-main/current
 ln -sfn "$(cat "$backup/previous-web")" /var/www/beeeval-main
 systemctl daemon-reload
 systemctl restart beeeval-main-auth beeeval-light beescene
 nginx -t && systemctl reload nginx
}
trap 'rollback' ERR
install -m 644 "$release/deploy/unified-site.conf" /etc/nginx/snippets/beeeval-unified.conf
install -m 644 "$release/deploy/data.conf" /etc/nginx/snippets/beeeval-main-data.conf
python3 - <<'PY'
from pathlib import Path
import re
p=Path('/etc/nginx/conf.d/d.conf');s=p.read_bytes().decode('utf-8','surrogateescape')
s,n=re.subn(r'    include /etc/nginx/snippets/(?:beescene|beeeval-light|beeeval-main)\.conf;\r?\n','',s)
assert n==3,n
s=s.replace('server_name www.beeeval.com beeeval.com;','server_name www.beeeval.com beeeval.com;\n    include /etc/nginx/snippets/beeeval-unified.conf;',1)
s,n=re.subn(r'    location / \{\s*proxy_pass http://localhost:3000;.*?^    \}', '',s,flags=re.M|re.S)
assert n==1,n
p.write_bytes(s.encode('utf-8','surrogateescape'))
PY
nginx -t
install -m 644 "$release/deploy/beeeval-main-auth.service" /etc/systemd/system/beeeval-main-auth.service
install -m 644 "$release/deploy/beeeval-data.service" /etc/systemd/system/beeeval-light.service
install -m 644 "$release/deploy/beeeval-scenes.service" /etc/systemd/system/beescene.service
ln -sfn "$release" /opt/beeeval-main/current
ln -sfn "$release/dist" /var/www/beeeval-main
systemctl daemon-reload
systemctl restart beeeval-main-auth beeeval-light beescene
for port in 5190 5188 5180; do
 for attempt in $(seq 1 20); do if ss -ltn | grep -q "127.0.0.1:$port ";then break;fi;sleep 1;done
 ss -ltn | grep -q "127.0.0.1:$port "
done
systemctl is-active beeeval-main-auth beeeval-light beescene
nginx -t
systemctl reload nginx
curl -fsS --resolve www.beeeval.com:443:127.0.0.1 https://www.beeeval.com/ -o /dev/null
trap - ERR
printf 'Release: %s\nRollback backup: %s\n' "$release" "$backup"
