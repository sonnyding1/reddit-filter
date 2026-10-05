"""Zip src/ into dist/reddit-filter-<version>.zip for the Chrome Web Store."""
import json, pathlib, zipfile

root = pathlib.Path(__file__).parent
src = root / 'src'
version = json.loads((src / 'manifest.json').read_text())['version']
out = root / 'dist' / f'reddit-filter-{version}.zip'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(src.rglob('*')):
        if f.is_file() and not f.name.startswith('.'):
            z.write(f, f.relative_to(src))
print(out, out.stat().st_size, 'bytes')
