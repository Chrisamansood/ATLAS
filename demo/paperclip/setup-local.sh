#!/bin/zsh
set -eu
if [[ $# -ne 1 || ! -d "$1/server" || ! -d "$1/ui" ]]; then
  print -u2 'Usage: ./demo/paperclip/setup-local.sh /path/to/existing/paperclip'
  exit 2
fi
ATLAS_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ATLAS_RUNTIME="$ATLAS_ROOT/demo/.runtime"
ATLAS_SOURCE="$ATLAS_RUNTIME/paperclip-source"
ATLAS_INSTANCE="$ATLAS_RUNTIME/paperclip-instance"
if [[ -e "$ATLAS_SOURCE" ]]; then
  print -u2 "ATLAS source already exists: $ATLAS_SOURCE"
  exit 1
fi
mkdir -p "$ATLAS_RUNTIME" "$ATLAS_INSTANCE"
cp -cR "$1" "$ATLAS_SOURCE"
python3 "$ATLAS_ROOT/demo/paperclip/prepare_brand.py"
mkdir -p "$ATLAS_INSTANCE/home" "$ATLAS_INSTANCE/db" "$ATLAS_INSTANCE/logs" "$ATLAS_INSTANCE/storage" "$ATLAS_INSTANCE/secrets"
python3 - "$ATLAS_INSTANCE" <<'PY'
import json, pathlib, sys
root=pathlib.Path(sys.argv[1]); config=root/'config.json'
if config.exists(): raise SystemExit(f'Existing ATLAS config left unchanged: {config}')
config.write_text(json.dumps({
  '$meta': {'version':1,'source':'atlas-setup'},
  'database': {'mode':'embedded-postgres','embeddedPostgresDataDir':str(root/'db'),'embeddedPostgresPort':54339,'backup':{'enabled':False,'dir':str(root/'backups')}},
  'logging': {'mode':'file','logDir':str(root/'logs')},
  'server': {'host':'127.0.0.1','port':3110,'serveUi':True,'deploymentMode':'local_trusted','exposure':'private'},
  'telemetry': {'enabled':False},'updates': {'checkEnabled':False},
  'storage': {'provider':'local_disk','localDisk':{'baseDir':str(root/'storage')}},
  'secrets': {'provider':'local_encrypted','localEncrypted':{'keyFilePath':str(root/'secrets/master.key')}}
},indent=2)+'\n')
print(f'Isolated ATLAS Paperclip prepared at {root}')
PY
