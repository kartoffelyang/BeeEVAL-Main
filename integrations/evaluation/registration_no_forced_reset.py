"""Make newly provisioned and reset accounts ready for direct password login."""
from pathlib import Path

def patch(text):
 text=text.replace('must_reset_pwd: bool = True','must_reset_pwd: bool = False')
 text=text.replace('bool(req.must_reset_pwd), expires_at','False, expires_at')
 text=text.replace('must_reset_pwd = TRUE','must_reset_pwd = FALSE')
 text=text.replace('TRUE, TRUE, 1, %s)','TRUE, FALSE, 1, %s)')
 return text

if __name__=='__main__':
 import sys
 p=Path(sys.argv[1]);s=patch(p.read_text());compile(s,str(p),'exec');p.write_text(s)
