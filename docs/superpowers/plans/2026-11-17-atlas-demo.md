# ATLAS demo duplication implementation plan

**Goal:** Bring the owner's existing HIVE and Proving Ground screens into this repository under ATLAS branding without changing the source project or requiring Docker builders.

**Architecture:** A separate `demo/` application uses the existing dependency-free Node server and synthetic BSS libraries. Replace service discovery with a local synthetic organization adapter; keep all five HIVE themes and the twin, catalogue, CRM, back office, replay and ontology views. The Python trust gateway remains independent in this extraction.

**Tech stack:** Node.js 22+, built-in HTTP and test runner; existing Python 3.11+ policy engine.

## Constraints
- Read-only source project; compare tracked-file hashes after extraction.
- No Docker, vendor checkout, credentials, runtime snapshot, account history, model evaluation datasets, internal context documents or branded raster assets in the copy.
- Fresh `.runtime/` below `demo/`, ignored by Git. Bind only loopback on port 3500.
- No calls or links to the source demo's services or local filesystem paths.
- Preserve the existing themes and substantive screen interactions.
- Label synthetic organization data and distinguish twin policies from the ATLAS policy engine.
- Existing unrelated untracked ATLAS directories stay untouched and uncommitted.

## Tasks
- [x] Copy the screen dependency closure into `demo/`, replacing brand names and identifiers consistently. Keep general ontology and synthetic fixtures; omit the optional internal-derived ontology pack.
- [x] Adapt the server to standalone mode with an in-memory synthetic organization, local navigation, fresh runtime storage and no service discovery. Add an organization roster page in the shared theme.
- [x] Add a package manifest, startup/readme documentation, ignore rules and automated checks. Test all page routes, HIVE themes, replay and sandbox actions; scan for original branding, paths and secrets.
- [x] Run the existing Python tests and imported relevant Node tests. Inspect the running UI. Verify source hashes, then commit only the intended files and prepare a GitHub branch/PR.

## Verification commands
```sh
npm --prefix demo test
python3 -m unittest discover -s tests -v
npm --prefix demo start
```

GitHub publication uses only the reviewed branch changes. No source-project git operations, pushes or runtime changes are part of this work.

## Verification result

100 Node tests and 24 Python tests pass. Browser checks verified HIVE, sandbox unknown-agent refusal and the gate-off replay comparison. Source-project tracked-file hashes are checked before publication.
