import asyncio,types
from unittest.mock import patch
from api.routers import admin_users as m
from fastapi import HTTPException
u=dict(id=987654321,username='fixture_only',role='viewer',display_name='',is_active=True,must_reset_pwd=False,membership_tier='free',scenario_enabled=False)
class DB:
 def raw_sql(self,sql,args=None):
  assert args[0]==u['id'],(sql,args)
  if sql.startswith('INSERT INTO user_report_entitlements'):u['scenario_enabled']=True
  elif sql.startswith('DELETE FROM user_report_entitlements'):u['scenario_enabled']=False
  else:raise AssertionError(sql)
  return types.SimpleNamespace(data=[])
async def run():
 with patch.object(m,'supabase',DB()),patch.object(m,'_get_user_by_id',lambda _id:dict(u)):
  current={'id':1,'username':'fixture_admin'}
  a=await m.update_user(req=m.UpdateUserRequest(scenario_enabled=True,expected_scenario_enabled=False),user_id=u['id'],current=current)
  assert a.scenario_enabled and a.membership_tier=='free'
  try:await m.update_user(req=m.UpdateUserRequest(scenario_enabled=False,expected_scenario_enabled=False),user_id=u['id'],current=current)
  except HTTPException as e:assert e.status_code==409
  else:raise AssertionError('stale update accepted')
  a=await m.update_user(req=m.UpdateUserRequest(scenario_enabled=False,expected_scenario_enabled=True),user_id=u['id'],current=current)
  assert not a.scenario_enabled and a.membership_tier=='free'
  u['role']='admin'
  try:await m.update_user(req=m.UpdateUserRequest(scenario_enabled=False),user_id=u['id'],current=current)
  except HTTPException as e:assert e.status_code==400
  else:raise AssertionError('disabled admin')
 print('PASS isolated: grant, refetch, stale edit rejection, revoke, membership unchanged, admin protected; no production records modified')
asyncio.run(run())
