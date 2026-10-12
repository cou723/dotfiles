#!/usr/bin/env python3
"""Exercise the actual Pi extension without a model request or real secrets."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
cache = Path.home() / '.cache'
cache.mkdir(exist_ok=True)
base = Path(tempfile.mkdtemp(prefix='xzzpig-test-', dir=cache))
try:
    workspace = base / 'workspace'
    workspace.mkdir()
    (workspace / '.env').write_text('TEST_ONLY_NOT_A_SECRET=1\n')
    result = subprocess.run([
        'pi', '--offline', '--no-extensions', '--no-mcp', '--no-skills',
        '--no-context-files', '--no-session', '-e', str(root / 'test/verify-in-pi.ts'),
        '--print', '/verify-sandbox',
    ], cwd=workspace, text=True, capture_output=True, timeout=35)
    output = result.stdout + result.stderr
    print(output)
    if result.returncode or 'Extension error' in output or 'PASS: real sandbox' not in output:
        raise SystemExit(1)
finally:
    shutil.rmtree(base)
