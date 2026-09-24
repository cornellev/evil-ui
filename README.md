# evil-ui

Browses [EVIL](https://github.com/cornellev/evil)'s derived tables (runs,
turns, laps, straights) and lets you ask [tern-llm](https://github.com/cornellev/tern-llm)
questions, in one app. Deliberately its own repo, not folded into either --
see `inference-agent/4.md`'s plan doc for why: this app is a network client
of both (MCP for browsing, HTTP for chat), never schema-coupled to EVIL's
tables the way EVIL's own MCP tools are, and it churns on a different
cadence than either of the services it depends on.

## Architecture

```
frontend (React + TS + Vite + MUI, Bun)
   |  fetch()
   v
backend (FastAPI)
   |                              |                          |
   | MCP (list_runs/list_turns/   | HTTP POST /ask           | HTTP POST /upload
   | list_laps/list_straights)    |                          |
   v                              v                          v
evil's MCP server              tern-llm's /ask          evil's upload_server
```

The backend never re-implements EVIL's tool logic, tern-llm's harness, or
EVIL's ingestion -- it's a browsing-shaped MCP client for one, and a thin
HTTP proxy for the other two (the same `forward_bag_request` proxy shape
`RaceEngineerDashboard/backend/main.py` already uses). Uploads proxy to
`evil`'s separate `upload_server.py`, not the MCP server -- MCP is EVIL's
read interface, uploading is a write.

## Layout

```
backend/
  src/evil_ui_backend/
    mcp_client.py    own copy of tern-llm's MCPToolClient (same "protocol is
                     the contract, not shared code" reasoning as evil/tern-llm)
    main.py          FastAPI: /runs, /runs/{id}/turns|laps|straights, /ask proxy, /upload proxy
  tests/             dummy MCP server + fake tern-llm/evil-upload upstreams, all real
                     running servers in background threads, not mocks
frontend/
  src/
    api.ts           typed fetch helpers
    pages/
      RunsList.tsx        browse every run
      RunDetail.tsx       tabs: Turns / Laps / Straights
      UploadRecording.tsx  upload a CSV or rosbag .db3, then jump to its run
    components/
      ChatPanel.tsx    ask tern-llm, shown alongside the browsing pages
  server.ts          Bun static server for the built app (matches
                     RaceEngineerDashboard/frontend/server.ts's pattern)
```

## A real bug this repo's tests found

Building this surfaced a real, previously-latent bug in the MCP client
pattern shared with `tern-llm`: a tool returning `list[...]` (`list_runs`,
`read_only_sql`) gets **one `TextContent` block per list item** from the MCP
SDK, not one JSON array. The old client code read only `content[0].text`,
which silently returned just the first item and raised on an empty list --
unnoticed until this repo's stricter equality-based tests (rather than
loose substring checks) caught it. Fixed by preferring `structured_content`
(reliable for every list size) in both `evil-ui` and `tern-llm`'s
`mcp_client.py`, with regression tests for 0/1/many-item cases in both
repos and evil's own e2e check strengthened to match.

## Getting started

```bash
EVIL_MCP_URL=http://<evil-host>:8765/mcp EVIL_UPLOAD_URL=http://<evil-host>:8766 \
TERN_LLM_URL=http://<tern-llm-host>:8000 \
VITE_API_BASE_URL=http://<this-host>:8080 \
    docker compose up --build
```

Then open `http://<this-host>:8081`.

`VITE_API_BASE_URL` is a **build-time** value (Vite bakes `import.meta.env.VITE_*`
into the static bundle at `vite build`, it isn't read at container start) --
changing it means `docker compose build frontend` again, not just
restarting the container.

Docker itself works in this environment (confirmed: `docker --version`,
`docker ps`); `docker compose` (the plugin) was not yet installed when this
was last verified, so the compose-based command above is syntax-checked,
not run end to end via compose specifically -- though the equivalent
manually-started services (real `evil` MCP server + upload server + this
backend + this frontend) were run for real and browser-verified, see below.

## Running tests

```bash
cd backend && .venv/bin/python -m pytest        # unit + integration, self-contained
cd frontend && bun run build                     # type-checks + builds
```

The frontend was manually verified in a real headless browser (system
Chromium via Playwright, not a mock) against the real backend, a real evil
MCP server, and a real evil upload server, twice: once against seeded data
(runs list rendered `run-1`, detail tabs showed `Turn 3`), and again for the
upload flow specifically -- uploaded a real synthetic rosbag `.db3` through
the browser's Upload page, through this backend's proxy, into evil's real
`upload_server.py` and `ingest_recording()`, and confirmed the resulting
run (`upload-demo`, 4 rows) appeared in the runs list and its detail page
without a page reload. Zero console/page errors both times. Both
verifications were one-off manual runs in this session (screenshots/scripts
weren't kept, they're not part of the app); neither is an automated
Playwright test in CI.

## Not yet built

- Pagination controls in the UI itself -- the backend endpoints accept
  `limit`/`offset`, the frontend always requests the default page.
- Any automated browser test (the Playwright checks above were manual, one-off).
- Deploying anywhere for real, including pointing this at `cev-nuc` and a
  real tern-llm host over Tailscale -- verified here against localhost only.
