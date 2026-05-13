#!/bin/sh
set -eu

secret_root="${NITSYCLAW_SECRET_ROOT:-/home/node/.nitsyclaw/secrets}"
session_dir="${WHATSAPP_SESSION_DIR:-.wa-session}"

case "$secret_root" in
  /*) ;;
  *) echo "NITSYCLAW_SECRET_ROOT must be an absolute path." >&2; exit 1 ;;
esac

case "$secret_root" in
  /|/app|/app/*|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/proc|/root|/run|/sbin|/sys|/tmp|/usr|/var)
    echo "Refusing unsafe NITSYCLAW_SECRET_ROOT: $secret_root" >&2
    exit 1
    ;;
esac

case "$session_dir" in
  /*)
    echo "WHATSAPP_SESSION_DIR must be relative in Railway runtime." >&2
    exit 1
    ;;
  *..*)
    echo "WHATSAPP_SESSION_DIR must not contain traversal." >&2
    exit 1
    ;;
esac

session_root="$secret_root/$session_dir"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$secret_root" "$session_root"

  chown node:node "$secret_root" "$session_root"
  find "$session_root" -maxdepth 3 \
    \( -name "SingletonLock" -o -name "SingletonSocket" -o -name "SingletonCookie" \) \
    -exec rm -f {} +

  exec gosu node "$@"
fi

exec "$@"
