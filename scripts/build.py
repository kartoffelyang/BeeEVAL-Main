from pathlib import Path
import shutil,subprocess,os,re,hashlib
from urllib.parse import urlsplit
root=Path(__file__).resolve().parents[1]
env=dict(os.environ,SITE_BASE_PATH='/scenes/',VITE_API_BASE='/scenes/api/')
subprocess.run(['npm','run','build'],cwd=root/'scenario-library',env=env,check=True)
dist=root/'dist'
if dist.exists():shutil.rmtree(dist)
shutil.copytree(root/'site',dist)
shutil.copytree(root/'scenario-library/dist',dist/'scenes')
images=dist/'scenes/images';images.mkdir()
for i in range(1,7):shutil.copy(root/f'scenario-library/public/scenario-images/top-{i:03}-v1.webp',images)
data_env=dict(os.environ,SITE_BASE_PATH='/data/',VITE_API_BASE_URL='/data/api',VITE_SERVER_URL='/data')
subprocess.run(['npm','run','build'],cwd=root/'data-platform',env=data_env,check=True)
subprocess.run(['npm','run','build:server'],cwd=root/'data-platform',check=True)
shutil.copytree(root/'data-platform/dist',dist/'data',ignore=shutil.ignore_patterns('*.map'))
for javascript in (dist/'data').rglob('*.js'):
 text=javascript.read_text();javascript.write_text(re.sub(r'//# sourceMappingURL=.*', '', text))
# Content-address local CSS/JS references so each build loads the matching code.
def version_tag(match,html):
 tag=match.group(0)
 def version_attribute(attr):
  quote,url=attr.group(2),attr.group(3);parts=urlsplit(url)
  if parts.scheme or parts.netloc:return attr.group(0)
  target=(dist/parts.path.lstrip('/')) if parts.path.startswith('/') else (html.parent/parts.path)
  target=target.resolve()
  if not target.is_relative_to(dist.resolve()) or not target.is_file() or target.suffix not in ('.js','.css'):return attr.group(0)
  digest=hashlib.sha256(target.read_bytes()).hexdigest()[:12]
  return attr.group(1)+'='+quote+parts.path+'?v='+digest+quote
 return re.sub(r"(src|href)=([\"'])(.*?)(?:\2)",version_attribute,tag)
for html in dist.rglob('*.html'):
 text=html.read_text();updated=re.sub(r'<(?:script|link)\b[^>]*>',lambda m:version_tag(m,html),text)
 if updated!=text:html.write_text(updated)
# Public build assets must be readable by the web server after archive extraction.
for asset in dist.rglob('*'):
 if asset.is_file():asset.chmod(0o644)
 elif asset.is_dir():asset.chmod(0o755)
print('Built unified root site, /scenes/ and /data/: public report and product summaries, protected full reports and scenario library')
