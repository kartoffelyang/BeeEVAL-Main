#!/usr/bin/env bash
# Run on the evaluation host with a Git-derived source archive.
set -euo pipefail
revision="${1:?revision required}"
[[ "$revision" =~ ^[0-9a-f]{7,40}$ ]] || exit 2
archive="${2:?source archive required}"
project=/data/beeeval_data_analyze
base="$project/.identity-release/releases/$revision"
backup="$project/.identity-release/backups/$(date -u +%Y%m%dT%H%M%SZ)-$revision"
install -d -m 700 "$base" "$backup"
files=$(docker inspect beeeval-api --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}')
IFS=',' read -r -a configs <<< "$files"
args=();for config in "${configs[@]}";do args+=(-f "$config");done
old_image=$(docker inspect beeeval-api --format '{{.Config.Image}}')
printf '%s\n' "$old_image" > "$backup/image"
printf '%s\n' "$files" > "$backup/config-files"
tar -xzf "$archive" -C "$base" integrations/evaluation
install -d "$base/api/routers" "$backup/host"
docker cp beeeval-api:/app/api/main.py "$base/api/main.py"
docker cp beeeval-api:/app/api/routers/member_accounts.py "$backup/member_accounts.py"
cp "$base/api/main.py" "$backup/main.py"
cp "$base/integrations/evaluation/member_accounts.py" "$base/api/routers/member_accounts.py"
python3 "$base/integrations/evaluation/apply_password_recovery.py" "$base"
docker run --rm --entrypoint python -v "$base:/source:ro" "$old_image" -c "from pathlib import Path;[compile(p.read_text(),str(p),'exec') for p in [Path('/source/api/main.py'),Path('/source/api/routers/member_accounts.py'),Path('/source/api/routers/password_recovery.py')]]"
# Extend the running image without rebuilding evaluation or ML dependencies.
docker image tag "$(docker inspect beeeval-api --format '{{.Image}}')" "beeeval-api:account-base-$revision"
printf 'FROM beeeval-api:account-base-%s\nCOPY api/main.py /app/api/main.py\nCOPY api/routers/member_accounts.py /app/api/routers/member_accounts.py\nCOPY api/routers/password_recovery.py /app/api/routers/password_recovery.py\n' "$revision" > "$base/Dockerfile"
docker build -t "beeeval-api:account-$revision" "$base"
docker exec beeeval-postgres sh -c 'exec pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -t public.users' > "$backup/users.sql"
chmod 600 "$backup/users.sql"
docker exec -i beeeval-postgres sh -c 'exec psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -v ON_ERROR_STOP=1 --single-transaction' < "$base/integrations/evaluation/password_recovery.sql"
printf 'services:\n  api:\n    image: beeeval-api:account-%s\n' "$revision" > "$base/compose.yml"
rollback(){ code=$?;trap - ERR;docker compose "${args[@]}" up -d --no-deps --no-build api;echo 'Previous identity image restored.' >&2;exit "$code"; }
trap rollback ERR
cd "$project"
docker compose "${args[@]}" -f "$base/compose.yml" up -d --no-deps --no-build api
for attempt in $(seq 1 40);do
 if docker exec beeeval-api python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8004/health',timeout=2)" >/dev/null 2>&1;then break;fi
 sleep 1
done
docker exec beeeval-api python -c "from api.main import app;paths={r.path for r in app.routes};assert '/api/auth/password-reset-code' in paths and '/api/auth/password-reset' in paths;print('Password recovery routes registered')"
for file in api/main.py api/routers/member_accounts.py api/routers/password_recovery.py;do
 if [ -f "$project/$file" ];then cp -a "$project/$file" "$backup/host/$(basename "$file")";fi
 install -m 644 "$base/$file" "$project/$file"
done
printf '%s\n' "$revision" > "$base/REVISION"
ln -sfn "$base" "$project/.identity-release/current"
trap - ERR
printf 'Identity release: %s\nRollback backup: %s\n' "$base" "$backup"
