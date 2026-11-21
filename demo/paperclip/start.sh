#!/bin/zsh
set -eu
ATLAS_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ATLAS_RUNTIME="$ATLAS_ROOT/demo/.runtime/paperclip-instance"
export PAPERCLIP_HOME="$ATLAS_RUNTIME/home"
export PAPERCLIP_CONFIG="$ATLAS_RUNTIME/config.json"
export PAPERCLIP_INSTANCE_ID=atlas-demo
export PORT=3110
export HOST=127.0.0.1
export HEARTBEAT_SCHEDULER_ENABLED=false
export PAPERCLIP_TELEMETRY_DISABLED=1
export PAPERCLIP_MIGRATION_AUTO_APPLY=true
export PAPERCLIP_MIGRATION_PROMPT=never
export PAPERCLIP_UI_DEV_MIDDLEWARE=true
unset DATABASE_URL ANTHROPIC_API_KEY OPENAI_API_KEY GEMINI_API_KEY GOOGLE_API_KEY
unset OTEL_EXPORTER_OTLP_ENDPOINT SENTRY_DSN SENTRY_DSN_FRONTEND SENTRY_DSN_BACKEND
cd "$ATLAS_ROOT/demo/.runtime/paperclip-source/server"
exec node node_modules/tsx/dist/cli.mjs src/index.ts
