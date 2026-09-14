---
name: Python API workflow convention
description: Artifact-managed API services run commands relative to their artifact directory.
---

For an artifact-managed Python API, the workflow command runs with the API artifact directory as its working directory. Use paths relative to that directory in the command, while Python imports can remain local to the backend package.

**Why:** A workspace-root-prefixed script path was resolved twice by the workflow and prevented the service from starting.

**How to apply:** When changing or adding Python API workflows, validate the command from the artifact directory and keep workspace-root paths out of the workflow command.