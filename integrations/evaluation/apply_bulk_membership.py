"""Idempotent account provisioning patch. No account changes or emails on install."""
from pathlib import Path
import ast, shutil

def patch(source):
    if '# bulk-membership-v1' in source:
        return source
    def change(old,new,count=1):
        nonlocal source
        if old not in source: raise RuntimeError('Provisioning anchor missing: '+old[:100])
        source=source.replace(old,new,count)
    change('from api.services import bulk_provision, email_service', 'from api.services import bulk_provision, email_service\nfrom api.services.account_invite import render_invite_email\n# bulk-membership-v1')
    for name in ('BulkPreviewRow','BulkCommitRow','BulkCommitRowIn'):
        change(f'class {name}(BaseModel):', f'class {name}(BaseModel):\n    membership_tier: Optional[Literal["free","base","plus","pro","trial"]] = "free"\n    scenario_enabled: bool = False')
    # Restrict new bulk roles, retaining viewer as the internal member role.
    start=source.index('class BulkCommitRowIn(');end=source.index('class BulkCommitRequest(')
    block=source[start:end].replace('Literal["admin", "analyst", "tester", "viewer"]','Literal["admin", "viewer"]').replace('ge=1, le=3650','ge=0, le=3650')
    source=source[:start]+block+source[end:]
    change('        "expires_days": r.expires_days,','        "expires_days": r.expires_days,\n        "membership_tier": r.membership_tier,\n        "scenario_enabled": r.scenario_enabled,')
    change('    if item.expires_days is not None:', '    if item.expires_days == 0:\n        effective_expires_at = None\n    elif item.expires_days is not None:')
    # The insert and independent entitlement commit atomically in one database statement.
    change('''            INSERT INTO users (username, password_hash, role, display_name,
                               email, department,
                               is_active, must_reset_pwd, password_version,
                               expires_at)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE, FALSE, 1, %s)''', '''            WITH created AS (
              INSERT INTO users (username,password_hash,role,display_name,email,department,
                                 is_active,must_reset_pwd,password_version,expires_at,membership_tier,status)
              VALUES (%s,%s,%s,%s,%s,%s,TRUE,FALSE,1,%s,%s,'active') RETURNING id
            ), entitlement AS (
              INSERT INTO user_report_entitlements(user_id,report_key,granted_by,expires_at)
              SELECT id,'scenarios',(SELECT id FROM users WHERE username=%s),%s FROM created WHERE %s
              RETURNING user_id
            ) SELECT id FROM created''')
    change('[email, pwd_hash, item.role, display, email, department, effective_expires_at],', '[email,pwd_hash,item.role,display,email,department,effective_expires_at,\n             None if item.role=="admin" else (item.membership_tier or "free"),\n             by_username,effective_expires_at,item.scenario_enabled and item.role!="admin"],')
    # All result rows retain the assigned permissions, including skipped/failed rows.
    start=source.index('async def _create_one_and_invite(');end=source.index('@router.post("/bulk/commit"')
    block=source[start:end].replace('role=item.role, department=item.department,','role=item.role, department=item.department, membership_tier=None if item.role=="admin" else (item.membership_tier or "free"), scenario_enabled=item.role=="admin" or item.scenario_enabled,')
    block=block.replace('email_service.render_invite_email(', 'render_invite_email(').replace('        role=item.role,\n','        role=item.role,\n        membership_tier=item.membership_tier,\n        scenario_enabled=item.scenario_enabled,\n')
    source=source[:start]+block+source[end:]
    # Manual creation and pending application approval use the same membership fields.
    for name in ('CreateUserRequest','ApproveApplicationRequest'):
        change(f'class {name}(BaseModel):', f'class {name}(BaseModel):\n    membership_tier: Optional[Literal["free","base","plus","pro","trial"]] = "free"\n    scenario_enabled: bool = False')
        start=source.index(f'class {name}(');end=source.index('\n\n',start)
        block=source[start:end].replace('role: RoleLiteral','role: Literal["admin","viewer"]')
        source=source[:start]+block+source[end:]
    change('''        INSERT INTO users (username, password_hash, role, display_name,
                           is_active, must_reset_pwd, password_version,
                           expires_at)
        VALUES (%s, %s, %s, %s, TRUE, %s, 1, %s)
        RETURNING id, username, role, display_name, is_active,
                  must_reset_pwd, last_login_at, created_at, expires_at''', '''        WITH created AS (
          INSERT INTO users (username,password_hash,role,display_name,is_active,must_reset_pwd,
                             password_version,expires_at,membership_tier,status)
          VALUES (%s,%s,%s,%s,TRUE,%s,1,%s,%s,'active') RETURNING *
        ), entitlement AS (
          INSERT INTO user_report_entitlements(user_id,report_key,granted_by,expires_at)
          SELECT id,'scenarios',%s,%s FROM created WHERE %s RETURNING user_id
        ) SELECT *, %s AS scenario_enabled FROM created''')
    change('         False, expires_at],', '         False,expires_at,None if req.role=="admin" else (req.membership_tier or "free"),\n         current["id"],expires_at,req.scenario_enabled and req.role!="admin",req.scenario_enabled or req.role=="admin"],')
    change('''        UPDATE users
           SET status = 'active', is_active = TRUE,''', '''        WITH activated AS (UPDATE users
           SET status = 'active', is_active = TRUE,''')
    change('''               expires_at = %s, updated_at = NOW()
         WHERE id = %s AND status = 'pending'
        """,
        [req.role, display, department, pwd_hash, expires_at, user_id],''', '''               expires_at = %s, membership_tier = %s, updated_at = NOW()
         WHERE id = %s AND status = 'pending' RETURNING id),
         entitlement AS (
           INSERT INTO user_report_entitlements(user_id,report_key,granted_by,expires_at)
           SELECT id,'scenarios',%s,%s FROM activated WHERE %s
           ON CONFLICT(user_id,report_key) DO UPDATE SET expires_at=EXCLUDED.expires_at,granted_by=EXCLUDED.granted_by
           RETURNING user_id
         ) SELECT id FROM activated
        """,
        [req.role,display,department,pwd_hash,expires_at,None if req.role=="admin" else (req.membership_tier or "free"),user_id,
         current["id"],expires_at,req.scenario_enabled and req.role!="admin"],''')
    change('            subject, plain, html = email_service.render_invite_email(', '            subject, plain, html = render_invite_email(')
    change('                role=req.role,\n','                role=req.role,\n                membership_tier=req.membership_tier,\n                scenario_enabled=req.scenario_enabled,\n')
    ast.parse(source)
    return source

def apply(root):
    root=Path(root);base=Path(__file__).parent
    p=root/'api/routers/admin_users.py';p.write_text(patch(p.read_text()))
    for name in ('bulk_provision.py','account_invite.py'):
        shutil.copy2(base/name,root/'api/services'/name)
    target=root/'api/services/templates';target.mkdir(exist_ok=True)
    shutil.copy2(base/'templates/beeeval_users_template.xlsx',target/'beeeval_users_template.xlsx')

if __name__=='__main__':
    import sys
    apply(sys.argv[1])
