#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

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
  "$DOCKER" compose --profile test run --rm frontend-test
}

cleanup_e2e_test() {
  "$DOCKER" compose -f docker-compose.e2e.yml down --remove-orphans
}

check_e2e() {
  trap cleanup_e2e_test EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  cleanup_e2e_test
  "$DOCKER" compose -f docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from playwright playwright
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
