#!/usr/bin/env bash
# Generates a self-signed TLS cert for LOCAL DEMONSTRATION of the production stack
# (docker-compose.prod.yml) only — never use a self-signed cert for a real deployment.
# For a real domain, replace fullchain.pem/privkey.pem with certs from Let's Encrypt (certbot)
# or your host's provided certs (see docs/ARCHITECTURE.md — Section 16, "Real HTTPS certificates").
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# Git Bash/MSYS on Windows rewrites a leading "/" in an argument (like "/CN=localhost" below)
# into a filesystem path before openssl ever sees it. Harmless everywhere else; exported only
# for this script's own openssl call.
export MSYS_NO_PATHCONV=1

openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout privkey.pem -out fullchain.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Generated infrastructure/nginx/certs/fullchain.pem and privkey.pem (self-signed, localhost, 365 days)."
echo "Browsers will warn about this cert — that's expected for a self-signed local demo."
