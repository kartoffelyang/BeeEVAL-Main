from pathlib import Path
import shutil,subprocess,os,re,hashlib
from urllib.parse import urlsplit
root=Path(__file__).resolve().parents[1]
env=dict(os.environ,SITE_BASE_PATH='/main/scenes/library/',VITE_API_BASE='/scene/api/')
subprocess.run(['npm','run','build'],cwd=root/'scenario-library',env=env,check=True)
dist=root/'dist'
if dist.exists():shutil.rmtree(dist)
shutil.copytree(root/'site',dist)
shutil.copytree(root/'scenario-library/dist',dist/'scenes/library')
images=dist/'scenes/images';images.mkdir()
for i in range(1,7):shutil.copy(root/f'scenario-library/public/scenario-images/top-{i:03}-v1.webp',images)
# Content-address local CSS/JS references so each build loads the matching code.
def version_tag(match,html):
 tag=match.group(0)
 def version_attribute(attr):
  quote,url=attr.group(2),attr.group(3);parts=urlsplit(url)
  if parts.scheme or parts.netloc:return attr.group(0)
  target=(dist/parts.path.removeprefix('/main/')) if parts.path.startswith('/main/') else (html.parent/parts.path)
  target=target.resolve()
  if not target.is_relative_to(dist.resolve()) or not target.is_file() or target.suffix not in ('.js','.css'):return attr.group(0)
  digest=hashlib.sha256(target.read_bytes()).hexdigest()[:12]
  return attr.group(1)+'='+quote+parts.path+'?v='+digest+quote
 return re.sub(r"(src|href)=([\"'])(.*?)(?:\2)",version_attribute,tag)
for html in dist.rglob('*.html'):
 text=html.read_text();updated=re.sub(r'<(?:script|link)\b[^>]*>',lambda m:version_tag(m,html),text)
 if updated!=text:html.write_text(updated)
print('Built /main/: public report and product summaries, protected full reports and scenario library')
