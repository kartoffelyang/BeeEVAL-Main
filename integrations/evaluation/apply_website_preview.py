"""Install the finite public homepage projection on current API source."""
from pathlib import Path
import shutil
import sys


def patch(root):
    root = Path(root)
    shutil.copyfile(Path(__file__).with_name('website_preview.py'), root/'api/services/website_preview.py')
    path = root/'api/main.py'
    text = path.read_text()
    if 'app.include_router(website_preview.router)' not in text:
        anchor = 'app.include_router(aggregation.router)'
        assert text.count(anchor) == 1
        text = text.replace(anchor, 'from api.services import website_preview\napp.include_router(website_preview.router)\n'+anchor)
        compile(text,str(path),'exec')
        path.write_text(text)
    # Translating text a Trial member already sees does not grant evidence access.
    path = root/'api/services/trial_domain_access.py'
    text = path.read_text()
    if "'/api/translate'" not in text:
        anchor = "'/api/aggregation/compare','/api/video/stream/sign'"
        assert text.count(anchor) == 1
        text = text.replace(anchor,anchor+",'/api/translate'")
        compile(text,str(path),'exec')
        path.write_text(text)


if __name__ == '__main__':
    patch(sys.argv[1])
