# AGENTS.md

> Repo-specific guidance for OpenCode sessions. The blocks at the bottom (GitNexus, Clauge) are auto-maintained by external tools — do not edit inside the `<!-- :start -->` / `<!-- :end -->` markers.

## Product boundaries (read first)

- **The active product is the `guide/` monorepo.** Everything else is legacy/frozen.
  - `guide/server/` — Express API (internal port `3001`, only reachable via the FastAPI proxy on `:8000`).
  - `guide/worker/` — Python render pipeline (Stages 1–4). Run scripts assume **repo root** as cwd, with `PYTHONPATH=guide/worker`.
  - `guide/web/` — React editor / debug console.
  - `guide/shared/` — TS types + HyperFrames composition logic, consumed by both `server` and `web` via the `@shared/*` path alias.
  - `guide/data/` — SQLite (`templates.db`), `config.json`, uploads, renders. **Gitignored, local only.**
- **Do NOT modify** `pixelle_video/` (legacy Python package, only imported by `api/` for compat) or `archive/legacy-pixelle/` (archived old product line). The root `pyproject.toml` describes the legacy package, not the guide product.
- The `api/` FastAPI gateway proxies `/api/templates|renders|digital-humans|uploads|config` + `/uploads` `/renders` static to the guide server on `:3001`.

## Commands

The root `Makefile` only delegates — every real target lives in `guide/Makefile`. Run from repo root:

```bash
make test-guide                 # worker unit tests (Python, the big suite)
make test-guide-server          # Express API unit tests (node --import tsx --test)
make test-guide-shared          # shared TS tests (HF adapters, composer)
make test-guide-fast            # timeline/ASS/audit unit tests only (fast gate)
make test-guide-e2e             # Playwright; self-boots isolated :3100 server + :5180 web
make lint-guide                 # ruff over guide/worker/worker + guide/scripts (no-op if ruff missing)
make validate-renders           # audit all render jobs under guide/data/renders
make validate-render-job JOB=<uuid>   # audit one render job (required arg)
make poll-render-job JOB=<uuid>
make verify-final-delivery JOB=<uuid>
make smoke-integrator           # full integrator smoke (default template_editor)
make smoke-integrator SUBMIT_ONLY=1   # submit only, skip poll
make restart-worker             # reload worker code after editing worker/
```

Root entry points: `./start_platform.sh` (orchestrates API `:8000` + web `:5173`); `./start_api.sh`; `./start_guide_web.sh`. If `:8000` is already occupied, recover the guide upstream via `make -C guide start-guide-internal`.
Docs: `http://127.0.0.1:8000/docs`, editor `http://127.0.0.1:5173`, debug console `:5173/debug`.

### Single-test invocation

- **Python worker test:** tests are invoked *from repo root*, not `guide/`. `run_pytest.sh` already `cd`s to repo root and exports `PYTHONPATH=guide/worker`, and prefers `uv run pytest`. Run one file:
  ```bash
  uv run pytest guide/worker/tests/test_timeline_sync.py -q
  uv run pytest guide/worker/tests/test_timeline_sync.py::TestClass::test_method -q
  ```
  **First run of worker tests needs `make setup-worker-venv`** (creates `guide/worker/.venv`) only when `uv` is absent; with `uv` present it reuses the root venv.
- **Server/shared TS test:** server tests are `node --import tsx --test $(find src -name '*.test.ts')`; run one file with:
  ```bash
  cd guide/server && node --import tsx --test src/render-utils.test.ts
  cd guide && node --import tsx --test shared/<file>.test.ts
  ```
- **Playwright:** `cd guide/web && npx playwright test <spec>` (or `npm run test:e2e <spec>`).

### Do NOT use

- `npm test` at the guide root — that script mixes `npm run test --workspace=server` with a stale `python3 -m unittest` discovery that does **not** match how tests actually run. Use the `make` targets above.
- `make -C guide test-guide-server` from a path with spaces — the server `test` script uses a shell glob expansion that can break; prefer `cd guide/server && npm test`.

## Setup prerequisites

- `guide/scripts/preflight.sh` checks node/uv/ffmpeg and `guide/.env`. Run it before first start.
- Copy `guide/.env.example` → `guide/.env` and fill `KIE_API_KEY`, `YUNTTS_API_KEY`, `WAVESPEED_API_KEY`, `SERVER_URL`. `guide/data/config.example.json` → `guide/data/config.json` is the parallel runtime config (also gitignored).
- Verify keys without booting services: `uv run python guide/scripts/verify_providers.py`.
- Some lint targets (web) and renders need Playwright Chromium (`npx playwright install --with-deps chromium`); `smoke-brand-render` needs `ffmpeg-full` from Homebrew on PATH (`/opt/homebrew/opt/ffmpeg-full/bin`).

## Toolchain quirks

- **`guide/` is an npm workspace root** (`web`, `server`). Install with `npm ci` inside `guide/`. `shared/` is *not* a workspace — it's consumed via `tsconfig` path alias `@shared/*` and is tested by direct glob (`node --import tsx --test shared/*.test.ts`).
- **Two Python layers, do not confuse them:** the root `pyproject.toml` (legacy `pixelle-video`, `uv`-managed, deps for ComfyUI/fastmcp/streamlit) vs `guide/worker/requirements.txt` (the worker's actual runtime deps: requests, edge-tts, faster-whisper, pytest). Worker tests pull from the worker requirements, not the root pyproject.
- **Ruff** is configured only in the root `pyproject.toml`: `line-length=100`, `target-version=py311`, selects `E,F,I`, ignores `E501`. `lint-guide` only lints `guide/worker/worker` and `guide/scripts` — it does **not** lint the root `pixelle_video/` package or random scripts. There is no root-level typecheck or lint for the TS side; `guide/web` has `eslint .`, `guide/server` has none (relies on `tsc -b` via `build`).
- **HyperFrames** (`@hyperframes/core`, pinned `0.6.114`): `npm run hf:compose|lint|render` in `guide/`. The `hyperframes_template` pipeline (debug path only, gated by `ENABLE_HF_TEMPLATE_PIPELINE=1`) renders via `hyperframes render` rather than Stage4 FFmpeg. Set `SKIP_HF_RENDER_SMOKE=1` to skip the slow Chrome render step in `smoke-hf-render` / CI.
- **Render pipeline contract** (see `guide/CONTEXT.md`): three execution paths — ① delivery (Worker, picks one of seven `pipeline_key`s, default `template_editor`) ② preview (HF iframe, no delivery) ③ debug (`hyperframes_template`, env-gated). Delivery films burn a **single ASS subtitle track** via one Stage4 FFmpeg pass; never double-burn FFmpeg + HF subtitles. Default integrator contract: `{"pipeline_key":"template_editor","input_mode":"template"}`.

## CI gate order (`.github/workflows/guide-ci.yml`)

The `guide-worker` job runs, in order: `smoke-integrator-ci` → `smoke-integrator-hf-ci` → `setup-worker-venv` → `validate-renders-ci` (fast timeline gate) → `test-guide` → `smoke-hf-render` (with `SKIP_HF_RENDER_SMOKE=1`). `guide-server` runs `npm run test --workspace=server`, `guide-shared` runs `make test-guide-shared`, `guide-e2e` runs Playwright on isolated ports. Mirroring this locally: run `make test-guide-shared && make test-guide-server && make validate-renders-ci && make test-guide` before pushing guide/ changes.

## Editing guardrails (from GitNexus block below)

This repo is GitNexus-indexed as `lingyi-dh-guide` (default branch `main`). Before editing any function/class/method, run `impact({target, direction:"upstream"})` and warn on HIGH/CRITICAL risk. Before renaming a symbol, use GitNexus `rename` (call-graph aware), not find-and-replace. Run `detect_changes()` before committing. Refresh the index with `node .gitnexus/run.cjs analyze`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **lingyi-dh-guide** (6343 symbols, 13947 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/lingyi-dh-guide/context` | Codebase overview, check index freshness |
| `gitnexus://repo/lingyi-dh-guide/clusters` | All functional areas |
| `gitnexus://repo/lingyi-dh-guide/processes` | All execution flows |
| `gitnexus://repo/lingyi-dh-guide/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- clauge:start -->
# Clauge — Dev Super-App

本项目已配置完整的 Clauge 工具链。所有配置文件位于项目根目录：

| 配置 | 文件 | 功能 |
|------|------|------|
| **主配置** | `clauge.config.json` | Agent Atlas / REST / SQL / Explorer / History 总开关 |
| **工作区** | `clauge.workspace.json` | 面板布局、终端、数据库、API 客户端、历史记录 |
| **知识图谱** | `clauge.atlas.json` | 代码 6 层架构、GitNexus 集成、导航规则 |
| **API 集合** | `clauge.rest.json` | 8 分类完整 REST 请求（Health / Templates / DH / Renders / Library / Assets / Config / Legacy） |
| **数据库** | `clauge.sql.json` | SQLite 表结构 + 预置查询模板（Templates / DH / Jobs / Logs / Analytics） |

## 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| Agent Atlas | Enabled | GitNexus 索引：6089 symbols, 13418 relationships, 300 flows |
| Workspace | Enabled | 左右下三栏面板 + 快速操作按钮 |
| REST | Enabled | 8 分类 40+ API 请求，支持 local/prod 环境切换 |
| SQL | Enabled | SQLite `guide/data/templates.db`，6 张表 + 30+ 预置查询 |
| NOSQL | Not configured | 本项目使用 SQLite，无 MongoDB/Redis |
| SSH | Not configured | 本地开发，无远程服务器 |
| Explorer | Enabled | 7 个书签快速导航关键目录 |
| History | Enabled | Git / API / SQL / 终端操作历史，30 天保留 |

## 快速命令

```bash
# 启动完整平台
./start_platform.sh

# API 文档
open http://127.0.0.1:8000/docs

# 测试
make -C guide test-guide

# 验证渲染
make -C guide validate-renders

# 刷新 GitNexus 索引
node .gitnexus/run.cjs analyze
```

详细配置说明见 `CLAUGE.md`。
<!-- clauge:end -->