"""Patch only the existing all-results endpoint; freeze against DB timestamps, not a web clock."""
def patch_video_source(text):
 start=text.index('@router.get("/all-results")');end=text.index('\n@router.',start+10)
 section=text[start:end]
 section=section.replace('ORDER BY {review_order}{trial_order}vr.{sort_by} {direction}\n','ORDER BY {review_order}{trial_order}vr.{sort_by} {direction}, vr.id {direction}\n')
 if 'freeze_snapshot: bool'not in section:
  section=section.replace('    created_before: Optional[str] = None,','    created_before: Optional[str] = None,\n    freeze_snapshot: bool = False,',1)
  old='        total = supabase.raw_sql_count(count_sql, params)'
  assert old in section
  section=section.replace(old,old+'''\n        snapshot_before = None\n        if freeze_snapshot:\n            latest = supabase.raw_sql(f"SELECT MAX(vr.created_at) AS value FROM video_results vr{where_clause}", params).data[0]["value"]\n            snapshot_before = latest.isoformat() if latest else None\n''',1)
  old='return {"data": rows, "total": total, "offset": offset, "limit": limit}'
  assert old in section
  section=section.replace(old,'return {"data": rows, "total": total, "offset": offset, "limit": limit, "snapshot_before": snapshot_before}',1)
 return text[:start]+section+text[end:]
