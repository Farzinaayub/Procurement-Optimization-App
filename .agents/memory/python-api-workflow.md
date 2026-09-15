---
name: Python API workflow convention
description: Artifact-managed API services run commands relative to their artifact directory.
---

Managed development workflows run with the API artifact directory as their working directory, but artifact production commands may start from the workspace root. Production commands should explicitly `cd artifacts/api-server` before launching the backend; once there, use package imports such as `backend.main:app`.

**Why:** The development workflow and production publisher do not guarantee the same working directory. A production command that assumes the artifact directory can fail before opening its configured port.

**How to apply:** Validate both the managed workflow and the production-style command from the workspace root. Keep the production command's directory change explicit and bind Uvicorn to the injected `PORT`.