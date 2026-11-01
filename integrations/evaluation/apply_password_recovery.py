"""Prepare local API sources only. Apply password_recovery.sql before a future release."""
from pathlib import Path
import shutil,sys
root=Path(sys.argv[1]);base=Path(__file__).parent
p=root/'api/main.py';s=p.read_text()
anchor='app.include_router(member_accounts.router)'
assert anchor in s,'Membership integration is required'
if 'app.include_router(password_recovery.router)' not in s:
    s=s.replace(anchor,anchor+'\nfrom api.routers import password_recovery\napp.include_router(password_recovery.router)',1)
shutil.copy2(base/'password_recovery.py',root/'api/routers/password_recovery.py');p.write_text(s)
