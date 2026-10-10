---
schema: 1
name: git-commit
enabled: false
description: Disabled draft; Git workflow and repository-write policy require user approval.
tools: [read, bash]
workspace: repository
sandbox:
  filesystem: undecided
  network: undecided
model: parent
timeoutMs: 180000
resultMaxChars: 4000
---
DRAFT — NOT EXECUTABLE. The launcher rejects this definition.
The minimal policy compiler does not implement repository-write agents, so changing
enabled alone must not activate it.

Proposed workflow (replace with the user's actual rules before enabling):
1. Confirm the target repository and inspect status/diff and existing staged changes.
2. Identify only changes belonging to the requested task; preserve unrelated changes.
3. Run the agreed checks; report failures rather than silently weakening checks.
4. Stage explicit paths; avoid blanket git add -A.
5. Produce the agreed commit title/body, including investigation and verification.
6. Commit only after all approved conditions are met.
7. Return the commit hash, changed-file summary and verification results, not the log.

Decisions still required:
- May the worker stage and commit on its own, or request approval first?
- Must an initially dirty index stop execution?
- Commit-message language, format and required checks.
- Exact repository/worktree and .git write grants (including linked worktrees).
- Whether hooks are allowed and what filesystem/network access they need.
- push, amend, rebase, reset, clean, force-push and commit --no-verify permissions.
  None of these operations is approved by this draft.
- Signing credentials and network access, if any.
