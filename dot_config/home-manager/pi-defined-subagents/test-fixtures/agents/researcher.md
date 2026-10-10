---
schema: 1
name: researcher
enabled: true
description: Offline parser and runner fixture; not a deployed agent definition.
tools: [read, bash, edit, write, grep, find, ls]
workspace: job-tmp
sandbox:
  filesystem: workspace-only
  network: unrestricted
model: parent
timeoutMs: 180000
resultMaxChars: 6000
---
OFFLINE_RESEARCH_ROLE_FIXTURE
Do not use this fixture as a production role.
