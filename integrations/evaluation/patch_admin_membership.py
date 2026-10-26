"""Extend the existing admin user API; leave roles, password and expiry controls intact."""
from pathlib import Path

def patch(path):
 s=Path(path).read_text()
 if 'registration_source' in s:return
 def change(old,new,count=1):
  nonlocal s
  if old not in s:raise RuntimeError('Admin users source anchor missing: '+old[:60])
  s=s.replace(old,new,count)
 change('    # 账号到期时间。None = 永久。', '    membership_tier: Optional[str] = None\n    registration_source: str = "website"\n    status: Optional[str] = None\n    # 账号到期时间。None = 永久。')
 change('class UpdateUserRequest(BaseModel):','class UpdateUserRequest(BaseModel):\n    membership_tier: Optional[Literal["free", "base", "plus", "pro", "max", "trial"]] = None\n    expected_membership_tier: Optional[str] = None')
 change('        id=int(row["id"]),','        id=int(row["id"]),\n        membership_tier=row.get("membership_tier"),\n        registration_source=row.get("registration_source") or "website",\n        status=row.get("status"),')
 # Both read paths supply the same fields. Newly created rows can use defaults.
 change('               data_visible_until\n        FROM users', '''               data_visible_until,membership_tier,status,
               CASE WHEN EXISTS(SELECT 1 FROM member_wechat_identities w WHERE w.user_id=users.id)
                    THEN 'wechat' ELSE 'website' END AS registration_source
        FROM users''',2)
 change("        WHERE status = 'active'\n        ORDER BY id ASC",'        ORDER BY id ASC')
 change('    if req.role is not None and req.role != target["role"]:', '''    if req.membership_tier is not None:
        if target['role']=='admin':raise HTTPException(400,detail='admin_membership_managed_by_role')
        if 'expected_membership_tier' in req.model_fields_set and req.expected_membership_tier != target.get('membership_tier'):
            raise HTTPException(409,detail='membership_changed_reload')
        if req.membership_tier != target.get('membership_tier'):
            sets.append('membership_tier = %s');params.append(req.membership_tier)

    if req.role is not None and req.role != target["role"]:''')
 change('        f"role={req.role} active={req.is_active} display={req.display_name} "','        f"role={req.role} active={req.is_active} display={req.display_name} membership={req.membership_tier} "')
 Path(path).write_text(s)
if __name__=='__main__':
 import sys
 patch(sys.argv[1])
