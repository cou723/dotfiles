#!/usr/bin/env bash
# Run outside Pi, with Pi sessions closed, when reproducing this configuration.
set -euo pipefail
agent="$HOME/.pi/agent"
package="$agent/extensions/xzzpig-sandbox-ui"
for command in chezmoi npm node pi python3; do
  command -v "$command" >/dev/null || { echo "Missing command: $command" >&2; exit 1; }
done
# Apply only this migration's resources, not unrelated pending chezmoi changes.
chezmoi apply "$package" "$agent/sandbox.json"
npm ci --prefix "$package" --ignore-scripts --legacy-peer-deps --no-audit --no-fund
node "$package/prepare-runtime.mjs"
npm test --prefix "$package"
python3 "$package/test/verify-runtime.py"
# Retire pi-perm only after the replacement passed the isolated test.
if [[ -d "$agent/extensions/pi-perm-ui" ]]; then
  mkdir -p "$agent/disabled-extensions"
  if [[ -e "$agent/disabled-extensions/pi-perm-ui" ]]; then
    echo 'Both active and disabled pi-perm-ui directories exist; resolve manually.' >&2
    exit 1
  fi
  mv "$agent/extensions/pi-perm-ui" "$agent/disabled-extensions/pi-perm-ui"
fi
printf 'Restart Pi to load xzzpig-sandbox-ui. Alt+A opens the profile picker.\n'
