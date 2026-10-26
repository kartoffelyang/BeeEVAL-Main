"""Expose an independent scenario entitlement on the existing admin users API."""
from pathlib import Path

def patch(s):
 if 'expected_scenario_enabled' in s:return s
 s=s.replace('class UserListItem(BaseModel):','class UserListItem(BaseModel):\n    scenario_enabled: bool = False')
 s=s.replace('class UpdateUserRequest(BaseModel):','class UpdateUserRequest(BaseModel):\n    scenario_enabled: Optional[bool] = None\n    expected_scenario_enabled: Optional[bool] = None')
 s=s.replace('        id=int(row["id"]),','        id=int(row["id"]),\n        scenario_enabled=row.get("role")=="admin" or bool(row.get("scenario_enabled")),')
 s=s.replace('               CASE WHEN EXISTS(SELECT 1 FROM member_wechat_identities', '''               EXISTS(SELECT 1 FROM user_report_entitlements e WHERE e.user_id=users.id
                      AND e.report_key='scenarios' AND (e.expires_at IS NULL OR e.expires_at>NOW())) AS scenario_enabled,
               CASE WHEN EXISTS(SELECT 1 FROM member_wechat_identities''')
 anchor='    if not sets:\n        return _row_to_item(target)'
 assert anchor in s
 s=s.replace(anchor,'''    if req.scenario_enabled is not None:
        if target['role']=='admin':raise HTTPException(400,detail='admin_scenario_always_enabled')
        enabled=bool(target.get('scenario_enabled'))
        if req.expected_scenario_enabled is not None and req.expected_scenario_enabled!=enabled:
            raise HTTPException(409,detail='scenario_access_changed_reload')
        if req.scenario_enabled:
            supabase.raw_sql("INSERT INTO user_report_entitlements(user_id,report_key,granted_by) VALUES(%s,'scenarios',%s) ON CONFLICT(user_id,report_key) DO UPDATE SET granted_by=EXCLUDED.granted_by,granted_at=NOW(),expires_at=NULL",[user_id,current['id']])
        else:
            supabase.raw_sql("DELETE FROM user_report_entitlements WHERE user_id=%s AND report_key='scenarios'",[user_id])
        logger.info(f"admin scenario_access: by={current['username']} target_id={user_id} enabled={req.scenario_enabled}")

'''+anchor.replace('target)','_get_user_by_id(user_id))'))
 return s
if __name__=='__main__':
 import sys
 p=Path(sys.argv[1]);p.write_text(patch(p.read_text()))
