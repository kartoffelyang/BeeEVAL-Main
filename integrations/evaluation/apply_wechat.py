"""Prepare a local Evaluation API checkout; never deploys or edits its DB."""
from pathlib import Path
import sys
root=Path(sys.argv[1]); source=Path(__file__).parent
main=root/'api/main.py'; members=root/'api/routers/member_accounts.py'
text=main.read_text(); accounts=members.read_text()
anchor='app.include_router(member_accounts.router)'
if anchor not in text:raise RuntimeError('Apply membership integration first; no files changed')
if 'app.include_router(wechat_accounts.router)' not in text:
    text=text.replace(anchor,anchor+'\nfrom api.routers import wechat_accounts\napp.include_router(wechat_accounts.router)',1)
if "'wechat':" not in accounts:
    old="def options():return {"
    if old not in accounts:raise RuntimeError('Registration-options anchor missing; no files changed')
    accounts=accounts.replace(old,old+"'wechat':bool(os.getenv('BEEEVAL_WECHAT_APPID') and os.getenv('BEEEVAL_WECHAT_APP_SECRET')),",1)
# Validate all anchors before writing any target file.
(root/'api/routers/wechat_accounts.py').write_text((source/'wechat_accounts.py').read_text())
members.write_text(accounts);main.write_text(text)
print('Local source prepared, including registration availability. Apply wechat.sql and configure server-only credentials before deployment.')

admin=root/'api/routers/admin_users.py'
if admin.exists():
    from patch_admin_membership import patch
    patch(admin)
