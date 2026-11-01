#!/usr/bin/env bash
# Run on the website host after uploading a Git-derived source + dist archive.
set -euo pipefail
revision="${1:?revision required}"
[[ "$revision" =~ ^[0-9a-f]{7,40}$ ]] || exit 2
archive="${2:?archive required}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
release="/opt/beeeval-main/releases/$stamp-$revision"
old=$(readlink -f /opt/beeeval-main/current)
old_public=$(readlink -f /var/www/beeeval-main)
backup="/var/backups/beeeval-main/$stamp-$revision"
install -d -m 700 "$backup"
printf '%s\n' "$old" > "$backup/previous-release"
printf '%s\n' "$old_public" > "$backup/previous-public"
# Preserve server-owned dependencies and the existing applications.
cp -a "$old" "$release"
tar -xzf "$archive" -C "$release"
printf '%s\n' "$revision" > "$release/REVISION"
find "$release/dist" -type d -exec chmod 755 {} +
find "$release/dist" -type f -exec chmod 644 {} +
rollback(){
 code=$?;trap - ERR;set +e
 ln -sfn "$old" /opt/beeeval-main/current
 ln -sfn "$old_public" /var/www/beeeval-main
 systemctl restart beeeval-main-auth
 echo 'Previous website release restored.' >&2
 exit "$code"
}
trap rollback ERR
nginx -t
ln -sfn "$release" /opt/beeeval-main/current
ln -sfn "$release/dist" /var/www/beeeval-main
systemctl restart beeeval-main-auth
for attempt in $(seq 1 20); do
 if curl -fsS http://127.0.0.1:5190/api/session -o /dev/null;then break;fi
 sleep 1
done
systemctl is-active --quiet beeeval-main-auth
curl -fsS --resolve www.beeeval.com:443:127.0.0.1 https://www.beeeval.com/account.html -o /dev/null
curl -fsS --resolve www.beeeval.com:443:127.0.0.1 https://www.beeeval.com/international.css -o /dev/null
trap - ERR
printf 'Release: %s\nRollback backup: %s\n' "$release" "$backup"
