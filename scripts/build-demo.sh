#!/bin/sh
set -eu
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"
if command -v docker >/dev/null 2>&1; then
  DOCKER=docker
else
  DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker
fi
# Only the build image and synthetic, standalone output are touched.
"$DOCKER" build --target build -t rdms-demo-build ./frontend
mkdir -p demo/dist
"$DOCKER" run --rm --network none -v "$ROOT_DIR/demo:/demo" rdms-demo-build npm run build:demo
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
root = Path('demo')
html = root / 'dist/RDMS-Demo.html'
with ZipFile(root / 'dist/RDMS-Demo.zip', 'w', ZIP_DEFLATED) as package:
    package.write(html, 'RDMS-Demo.html')
    package.write(root / '使用说明.txt', '使用说明.txt')
with ZipFile(root / 'dist/RDMS-Demo.zip') as package:
    assert package.testzip() is None
for path in [html, root / 'dist/RDMS-Demo.zip']:
    print(f'{path}: {path.stat().st_size:,} bytes; SHA256 {hashlib.sha256(path.read_bytes()).hexdigest()}')
PY
