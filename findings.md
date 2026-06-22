# Findings & Decisions

## Requirements
- 用户要求继续完成开发需求。
- 已完成的两个功能分支需要提交并推送到远程。
- 下一个 MVP 是 Stage4 render self-audit + JSON diagnostics skill mechanism。

## Research Findings
- `make test-guide-server` 通过 74 个测试。
- `make test-guide-fast` 通过 38 个测试。
- `npm run build` / `npx tsc -b` 仍有既有 TypeScript 错误（未引入新错误）。
- `make lint-guide` 因未安装 ruff 失败。
- 当前 `audit_render_job` 已覆盖：manifest 检查、segment 验证、成片时长、字幕覆盖、overlay 边界。
- `validate_job_after_assembly` 在 `pipeline.py` Stage4 之后调用，受 `timeline_validate` / `timeline_validate_strict` 配置控制。
- `renderIssues.ts` 中已有前端 lens 变量缺失检查；worker 端尚无对应检查。
- 新 Stage4 分支基于 `feat/brand-pack-data-closure`（HEAD `61c571d`），因此可使用 `frame_template_id` 字段。
- `assemble_final_video` 有 5 个 pipelines + pipeline.py + 脚本调用；通过 keyword-only 参数 `resolved_variables` 保持向后兼容。
- `pipeline.py` 与所有 pipeline classes 已持有 `resolved_variables`（来自 `parse_template`），只需在 assemble 时转发。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 先推已完成分支 | 避免后续 Stage4 开发与未提交改动冲突 |
| 继续 Stage4 self-audit MVP | 这是之前在对话中确定的下一个目标 |
| 新增 `stage4_audit.py` 模块 | 将检查逻辑与 `timeline_sync.py` 解耦，形成可插拔 skill 机制 |
| 保持 `audit_render_job` 返回结构不变 | 不破坏 `validate_job_after_assembly`、batch/validate 脚本、现有测试 |
| `resolved_variables` 作为 keyword-only 参数 | 不破坏 `assemble_final_video` 现有调用者 |
| 在 `dsl.json` 中保存 `variables` | 让 Stage4 audit 能检查 bound frame 的 lens 变量覆盖 |
| `get_duration` / `has_audio_stream` 通过 `timeline_sync` 模块属性访问 | 保持现有测试 mock 路径 `worker.timeline_sync.get_duration` 有效 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| CLAUDE_PLUGIN_ROOT 环境变量缺失 | 使用绝对路径调用 session-catchup.py |
| 首次创建 Stage4 worktree 基于 origin/main，缺少 `frame_template_id` | 删除后从 `feat/brand-pack-data-closure` 重新切出 |
| `run_stage4_audit` 中 `synced` 未定义 | 补回 `reconcile_timeline` 调用 |
| 新测试中 `get_duration` patch 未生效 | 改为模块属性访问 `timeline_sync.get_duration` |
| server 测试缺少 tsx | npm install |
| server 中 `library.integration.test.ts` OpenStoryline 字体导入失败 | 环境依赖问题，与本次改动无关 |

## Resources
- `.worktrees/uiux-polish-v3/guide/web/src/pages/AssetHubPage.tsx`
- `.worktrees/uiux-polish-v3/guide/web/src/pages/TemplateListPage.tsx`
- `.worktrees/brand-pack-data-closure/guide/shared/parsers/frameMd.ts`
- `.worktrees/brand-pack-data-closure/guide/shared/hyperframesComposer.ts`
- `guide/worker/worker/stage4_audit.py`
- `guide/worker/worker/timeline_sync.py`
- `guide/worker/worker/stage4_ffmpeg.py`
- `guide/worker/worker/pipeline.py`
- `guide/worker/worker/pipelines/*.py`
- `guide/worker/tests/test_stage4_audit.py`

## Visual/Browser Findings
- 无
