# ATLAS in actual local Paperclip

This is an isolated local Paperclip instance for a browser-recorded demonstration.
The seeded organization, task progress and artifacts are **synthetic scenario records**
prepared by the demo setup. They are not evidence of autonomous agent execution.

## Isolation

- App: `http://localhost:3110` (loopback only).
- Database: embedded PostgreSQL on port `54339`.
- Application copy: `demo/.runtime/paperclip-source/`.
- Instance data, config, logs and secrets: `demo/.runtime/paperclip-instance/`.
- Paperclip home is redirected with `PAPERCLIP_HOME`; the user's HOME is unchanged.
- No credentials or existing Paperclip runtime were imported.
- Heartbeat scheduler and agent wake policies are disabled. All agents are paused.
- Process adapters use `/usr/bin/false`; no paid LLM adapter is configured.
- Telemetry and update checks are disabled in the isolated configuration.
- The original vendor navigation injection was removed because it communicated
  with another local instance. Visible branding is changed only in this copy.

The source was cloned using macOS copy-on-write from the existing vendor
Paperclip checkout in the Proving Ground workforce demo. Its original source,
Git metadata, runtime and credentials are not modified by these scripts.
The copy retains Paperclip's MIT LICENSE. No source or runtime is committed.

## Start and seed

From the ATLAS root, pass the path of an existing Paperclip checkout. The setup
script copies it into the ignored ATLAS runtime and creates a separate database
configuration. It never edits the supplied checkout. The checkout must already
have its Node dependencies installed.

```sh
./demo/paperclip/setup-local.sh "/path/to/existing/paperclip"
```

Then start the isolated server:

```sh
./demo/paperclip/start.sh
```

In another terminal:

```sh
python3 demo/paperclip/seed.py
```

The seeder uses the real REST API and writes its URL/entity inventory to
`demo/.runtime/paperclip-instance/seed-result.json`. It reuses records by name
and task title on subsequent runs. Browser access should follow successful seeding.

## Browser story

1. Open the ATLAS dashboard and organization chart.
2. Inspect Ops Lead → Marketing Lead → Catalogue Agent → six specialists.
3. Open “Create 5G Momentum campaign,” then its coordination task and specialist subtasks.
4. Inspect competitor provenance, product specification, pricing and governance documents.
5. Show the launch approval task held for Ops Lead and the campaign creative draft.

The UI is actual Paperclip. The scenario is prepared demo data. No campaign was
sent, catalogue published, customer data loaded, or paid model execution performed.

## Verification status

- Server booted on `127.0.0.1:3110`; 282 migrations applied to the isolated database.
- Seeder passes Python syntax validation.
- API seeding completed successfully: ATLAS company, nine paused agents, nine
  tasks, six Markdown documents and six artifact work-product records.
- URL: `http://localhost:3110/ATL/dashboard`.
- Shell startup script passes syntax validation; runtime paths are Git-ignored.
- Browser walkthrough is performed separately by the main task.
