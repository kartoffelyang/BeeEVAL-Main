"""Apply reviewed integration to an existing local evaluation API checkout. No deployment."""
from pathlib import Path
import sys,shutil
root=Path(sys.argv[1]);source=Path(__file__).parent
shutil.copy2(source/'member_accounts.py',root/'api/routers/member_accounts.py')
p=root/'api/main.py';s=p.read_text()
if 'app.include_router(member_accounts.router)' not in s:s=s.replace('app.include_router(auth.router)','from api.routers import member_accounts\napp.include_router(member_accounts.router)\napp.include_router(auth.router)',1)
p.write_text(s)
p=root/'api/routers/auth.py';s=p.read_text();s=s.replace('    role: str\n','    role: str\n    membership_tier: Optional[str] = None\n',1).replace('        role=row["role"],','        role=row["role"],\n        membership_tier=row.get("membership_tier"),',1)
s=s.replace('expires_at, data_visible_until\n','expires_at, data_visible_until, membership_tier\n');p.write_text(s)
p=root/'api/routers/auth.py';s=p.read_text()
s=s.replace('    membership_tier: Optional[str] = None\n','    membership_tier: Optional[str] = None\n    report_entitlements: list[str] = Field(default_factory=list)\n',1)
s=s.replace('        membership_tier=row.get("membership_tier"),','        membership_tier=row.get("membership_tier"),\n        report_entitlements=[r["report_key"] for r in supabase.raw_sql("SELECT report_key FROM user_report_entitlements WHERE user_id=%s AND (expires_at IS NULL OR expires_at>NOW())",[row["id"]]).data],',1)
p.write_text(s)
p=root/'api/auth/deps.py';s=p.read_text().replace('expires_at, data_visible_until\n','expires_at, data_visible_until, membership_tier\n')
needle='        # must_reset_pwd 用户除了改密 / 看自己的资料以外都拦'
addition='''        # Self-registered free members may only use identity endpoints.
        if user.get("membership_tier") == "free" and req.url.path not in (
            "/api/auth/me", "/api/auth/profile", "/api/auth/change-password", "/api/auth/logout", "/api/auth/focus-time"
        ):
            raise HTTPException(status_code=403, detail="membership_required")

'''
if addition not in s:s=s.replace(needle,addition+needle,1)
p.write_text(s)
print('Local API source patched. Apply membership.sql before deployment; no accounts changed.')

# Stable pagination and a database-derived snapshot cutoff.
from stable_pagination import patch_video_source
p=root/'api/routers/video.py'
if p.exists():p.write_text(patch_video_source(p.read_text()))

# Paid data members keep full data even when the underlying business role is viewer.
p=root/'api/services/trial_policy.py'
if p.exists():
 s=p.read_text();needle='    return str(user.get("role") or "").lower() == TRIAL_ROLE'
 if 'user.get("membership_tier") in ("plus", "pro")' not in s:
  assert needle in s
  s=s.replace(needle,'    if user.get("membership_tier") in ("plus", "pro"):\n        return False\n'+needle,1);p.write_text(s)
