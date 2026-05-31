#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: build-release.sh <version>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist/release"

rm -rf "$DIST"
mkdir -p "$DIST"

export PATH="$(go env GOPATH)/bin:${PATH:-}"

echo "Building frontend..."
(
  cd "$ROOT/frontend"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
  npm run build
)

if [[ ! -d "$ROOT/frontend/dist" ]]; then
  echo "error: frontend/dist missing after npm run build" >&2
  exit 1
fi

build_dmg() {
  local arch="$1"
  echo "Building darwin/${arch}..."

  (
    cd "$ROOT"
    wails build -platform "darwin/${arch}" -clean
  )

  local app="$ROOT/build/bin/mac-cleaner.app"
  if [[ -n "${MACOS_SIGN_IDENTITY:-}" ]]; then
    codesign --deep --force --options runtime --sign "$MACOS_SIGN_IDENTITY" "$app"
  fi

  local stage
  stage="$(mktemp -d)"
  cp -R "$app" "$stage/"
  ln -s /Applications "$stage/Applications"

  local dmg="$DIST/mac-cleaner-${VERSION}-darwin-${arch}.dmg"
  hdiutil create -volname "Mac Cleaner" -srcfolder "$stage" -ov -format UDZO "$dmg" >/dev/null
  rm -rf "$stage"

  echo "Created $dmg"
}

build_dmg arm64
build_dmg amd64
