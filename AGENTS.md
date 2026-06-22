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
