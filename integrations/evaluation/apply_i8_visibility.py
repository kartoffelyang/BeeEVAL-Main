# -*- coding: utf-8 -*-
"""Hide Li i8 from default read-only MCP queries and Mini home projections.
Explicit vehicle queries and stored evaluation records remain intact.
"""
from pathlib import Path
import sys
CLAUSE = "LOWER(REGEXP_REPLACE(COALESCE(vr.brand_model,''), '\\s+', '', 'g')) <> '理想i8'"
def patch(root):
    root=Path(root)
    p=root/'api/routers/open_api_v1.py';s=p.read_text()
    if '# default-hidden-i8' not in s:
        anchor='    if brand_model:\n        where.append("vr.brand_model = %s")'
        assert s.count(anchor)==1
        s=s.replace(anchor,'    # default-hidden-i8: retain explicit vehicle queries.\n    if not brand_model:\n        where.append('+repr(CLAUSE)+')\n'+anchor)
        anchor="AND vr.brand_model IS NOT NULL AND BTRIM(vr.brand_model) <> ''"
        assert s.count(anchor)==1
        s=s.replace(anchor,anchor+'\n              AND '+CLAUSE)
        p.write_text(s)
    p=root/'api/routers/open_api_analytics.py';s=p.read_text()
    if '# default-hidden-i8' not in s:
        anchor='    if vehicle:\n        filters +='
        assert s.count(anchor)==1
        s=s.replace(anchor,'    # default-hidden-i8: aggregate and case defaults share one scope.\n    if not vehicle:\n        filters.append('+repr(CLAUSE)+')\n'+anchor)
        p.write_text(s)
    p=root/'api/routers/wechat_accounts.py';s=p.read_text()
    if '# default-hidden-i8' not in s:
        anchor='def _home_view(home, user):\n'
        assert s.count(anchor)==1
        s=s.replace(anchor,anchor+"    # default-hidden-i8: apply to cached as well as fresh projections.\n    home = {**home, **{key: [r for r in home[key] if str(r.get('brand_model') or '').lower().replace(' ', '') != '理想i8'] for key in ('vehicles', 'records')}}\n")
        p.write_text(s)
    for n in ['open_api_v1','open_api_analytics','wechat_accounts']:
        p=root/f'api/routers/{n}.py';compile(p.read_text(),str(p),'exec')
if __name__=='__main__':patch(sys.argv[1])
