# ATLAS HIVE & Proving Ground

A standalone edition of Chris Sood's personal agent-workforce demo, using the existing HIVE themes and Proving Ground screens with ATLAS branding.

## Run

Requires Node.js 22 or newer. No packages to install, Docker, model keys, external agent services or Python are needed for these screens.

```sh
npm --prefix demo start
```

Open **http://localhost:3500/hive**. Stop with Ctrl+C. Set `PORT` to change the port. The server binds to loopback only.

```sh
npm --prefix demo test
```

## Included

| Screen | Route | What works |
|---|---|---|
| HIVE | `/hive` | Sphere, Constellation, Globe, HUD and Swarm themes; synthetic organization; local sandbox review counts and call activity |
| Agent roster | `/organization` | Searchable synthetic roles and capabilities; no AI workers are started |
| Proving Ground | `/twin` | Deterministic bill-shock and retention replays, rule comparisons and customer-level differences |
| Twin Live | `/twin/live` | Event replay, bill explanation, sandbox credit requests, review and API desk |
| Billing back office | `/twin/office` | Synthetic customers, bills, payments, usage and cases |
| Customer workspace | `/twin/crm` | Included customer/back-office UI; the former external CRM iframe is replaced |
| Catalogue | `/twin/catalogue` | Synthetic offers, drafts and release records |
| Ontology explorer | `/` | Generic telecom, banking and healthcare demo vocabularies |
| Decision economics | `/decisions` | Existing screen with an honest empty state; private model results and evaluation datasets are not distributed |

## What this demonstrates

The Node twin has its own deterministic credit, retention and catalogue policies. It is not yet wired to the Python ATLAS trust gateway in the repository root. Its approval rules and rehearsal verdicts are not ATLAS policy decisions or security certifications. All customer and organization data is synthetic. There are no production integrations, live AI workers or measured attack-prevention claims.

The five HIVE layouts are retained. The organization comes from a checked-in synthetic roster instead of an external organization service. Builders, their Docker configuration, installed vendor code, service bridges and account connections are intentionally absent. Original screenshots, runtime databases, credentials, historical internal documents and the optional vendor-derived ontology pack are not included.

The duplicate was made from source files; the original project is not a runtime dependency. Fresh sandbox state and agent tokens are generated under `demo/.runtime/`, which Git ignores. For isolated test runs, `ATLAS_DEMO_DATA_DIR` can point to a disposable directory. Resetting the demo sandbox affects only this copy.

These are local demonstration APIs, not a publicly hosted service with authenticated human reviewers. Host and Origin checks prevent casual cross-origin writes; do not expose the server through a public tunnel. Google Fonts are optional network font requests; system font fallbacks keep the screens usable offline. Optional browser voice features depend on browser support and may use the browser vendor's speech service.

## Licensing

Code follows the root Apache-2.0 license. Documentation and scenario material follow the root CC-BY-4.0 documentation license. No Docker images or third-party application source trees are redistributed in this folder.
