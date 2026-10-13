from pathlib import Path
import shutil,subprocess,os
root=Path(__file__).resolve().parents[1]
env=dict(os.environ,SITE_BASE_PATH='/main/scenes/library/',VITE_API_BASE='/scene/api/')
subprocess.run(['npm','run','build'],cwd=root/'scenario-library',env=env,check=True)
dist=root/'dist'
if dist.exists():shutil.rmtree(dist)
shutil.copytree(root/'site',dist)
shutil.copytree(root/'scenario-library/dist',dist/'scenes/library')
images=dist/'scenes/images';images.mkdir()
for i in range(1,7):shutil.copy(root/f'scenario-library/public/scenario-images/top-{i:03}-v1.webp',images)
print('Built /main/: public preview, six free scenes, protected member library and reports')
