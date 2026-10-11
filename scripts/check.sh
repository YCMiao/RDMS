#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

RDMS_CHECK_TEMP_DIR=""

if command -v docker >/dev/null 2>&1; then
  DOCKER=docker
elif [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
  DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker
else
  echo "Docker CLI 不可用。" >&2
  exit 1
fi

cleanup_backend_test() {
  "$DOCKER" compose --profile test rm -sf db-test >/dev/null 2>&1
}

check_backend() {
  trap cleanup_backend_test EXIT INT TERM
  cleanup_backend_test
  "$DOCKER" compose --profile test run --build --rm backend-test
  cleanup_backend_test
  trap - EXIT INT TERM
}

check_frontend() {
  if [ "${RDMS_CHECK_CACHED_DEPS:-0}" = "1" ]; then
    "$DOCKER" build --target build -t rdms-check-deps ./frontend
    "$DOCKER" run --rm rdms-check-deps npm run check
    return
  fi
  "$DOCKER" compose --profile test run --rm frontend-test
}

cleanup_e2e_test() {
  "$DOCKER" compose -f docker-compose.e2e.yml down --remove-orphans
  if [ -n "${RDMS_CHECK_TEMP_DIR:-}" ]; then
    rm -rf -- "$RDMS_CHECK_TEMP_DIR"
    RDMS_CHECK_TEMP_DIR=""
  fi
}

check_e2e() {
  trap cleanup_e2e_test EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  cleanup_e2e_test
  if [ "${RDMS_CHECK_CACHED_DEPS:-0}" = "1" ]; then
    "$DOCKER" build --target build -t rdms-check-deps ./frontend
    RDMS_CHECK_TEMP_DIR=$(mktemp -d /tmp/rdms-check.XXXXXX)
    "$DOCKER" run --rm rdms-check-deps tar -C /app/node_modules -cf - @playwright/test playwright playwright-core > "$RDMS_CHECK_TEMP_DIR/playwright.tar"
    cat > "$RDMS_CHECK_TEMP_DIR/compose.yml" <<EOF
services:
  playwright:
    volumes:
      - $RDMS_CHECK_TEMP_DIR/playwright.tar:/tmp/playwright.tar:ro
    command: ["sh", "-c", "tar -xf /tmp/playwright.tar -C /work/node_modules && node node_modules/playwright/cli.js test"]
EOF
    "$DOCKER" compose -f docker-compose.e2e.yml -f "$RDMS_CHECK_TEMP_DIR/compose.yml" up --build --abort-on-container-exit --exit-code-from playwright playwright
  else
    "$DOCKER" compose -f docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from playwright playwright
  fi
  cleanup_e2e_test
  trap - EXIT INT TERM
}

case "${1:-}" in
  backend)
    check_backend
    ;;
  frontend)
    check_frontend
    ;;
  e2e)
    check_e2e
    ;;
  all)
    check_backend
    check_frontend
    check_e2e
    ;;
  *)
    echo "用法: scripts/check.sh {backend|frontend|e2e|all}" >&2
    exit 2
    ;;
esac
