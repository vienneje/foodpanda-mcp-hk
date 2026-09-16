#!/usr/bin/env bash
# Start a VISIBLE Chromium (on a virtual display) that owns the MCP's browser profile.
#
# Why: foodpanda's login must be typed by a human, and PerimeterX refuses headless browsers.
# This gives a real, headed Chromium on Xvfb whose profile is the one the MCP uses, so a login
# performed here is the login the server later orders with.
#
# It also exposes CDP (--remote-debugging-port) and links the profile into ~/.config/chromium,
# which is where generic browser tooling looks for DevToolsActivePort — so an automation harness
# can attach to this same window and drive/observe it.
#
# Usage:  scripts/login-browser.sh          # start (idempotent-ish; kills nothing)
#         scripts/login-browser.sh --stop   # stop browser + Xvfb
#
# Then connect to it remotely and log in — see README-HK "Logging in from a remote server".

set -u

STATE_DIR="${FOODPANDA_STATE_DIR:-$HOME/.foodpanda-mcp}"
# Default: the profile the MCP server itself uses. FOODPANDA_LOGIN_PROFILE lets you point at
# another dir — e.g. the one Hermes' own browser tooling expects ($HERMES_HOME/chrome-debug),
# so that tooling attaches to THIS window instead of launching its own headless browser.
PROFILE="${FOODPANDA_LOGIN_PROFILE:-${STATE_DIR}/browser-data}"
DISPLAY_NUM="${FOODPANDA_LOGIN_DISPLAY:-:77}"
CDP_PORT="${FOODPANDA_LOGIN_CDP_PORT:-9222}"
CHROME="${FOODPANDA_BROWSER_EXECUTABLE:-}"

if [ -z "$CHROME" ]; then
  # Fall back to the newest full Chromium Playwright installed.
  CHROME="$(find "$HOME/.cache/ms-playwright" -maxdepth 3 -name chrome -type f -path '*chrome-linux64*' 2>/dev/null | sort | tail -1)"
fi
if [ -z "$CHROME" ] || [ ! -x "$CHROME" ]; then
  echo "No Chromium binary found. Set FOODPANDA_BROWSER_EXECUTABLE or run: npx playwright install chromium" >&2
  exit 1
fi

stop() {
  pkill -f "remote-debugging-port=${CDP_PORT}" 2>/dev/null
  pkill -f "Xvfb ${DISPLAY_NUM}" 2>/dev/null
  echo "stopped"
  exit 0
}

[ "${1:-}" = "--stop" ] && stop

mkdir -p "$PROFILE" "$HOME/.config"
# Hermes' browser tooling reads DevToolsActivePort from a scanned profile dir; link one of
# them at this profile so a harness can discover the window.
ln -sfn "$PROFILE" "$HOME/.config/chromium"

# Virtual display (no-op if it is already up).
if [ ! -e "/tmp/.X11-unix/X${DISPLAY_NUM#:}" ]; then
  setsid Xvfb "$DISPLAY_NUM" -screen 0 1440x900x24 -nolisten tcp >"$STATE_DIR/xvfb.log" 2>&1 &
  for _ in $(seq 1 40); do
    [ -e "/tmp/.X11-unix/X${DISPLAY_NUM#:}" ] && break
    sleep 0.25
  done
fi

setsid env DISPLAY="$DISPLAY_NUM" "$CHROME" \
  --no-sandbox --disable-dev-shm-usage \
  --no-first-run --no-default-browser-check \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$PROFILE" \
  "https://www.foodpanda.hk/" >"$STATE_DIR/chrome.log" 2>&1 &

for _ in $(seq 1 40); do
  if curl -s --max-time 2 "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; then
    echo "browser up on DISPLAY=$DISPLAY_NUM, CDP http://127.0.0.1:${CDP_PORT}, profile=$PROFILE"
    echo "DevToolsActivePort: $(head -1 "$PROFILE/DevToolsActivePort" 2>/dev/null || echo '(not written)')"
    exit 0
  fi
  sleep 0.5
done

echo "browser did not come up; see $STATE_DIR/chrome.log" >&2
exit 1