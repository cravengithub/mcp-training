#!/bin/bash
# Script untuk test server dengan pesan JSON-RPC
cd "$(dirname "$0")"
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"ping-script","version":"1.0.0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ping"}}' | node dist/index.js
