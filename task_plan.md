# Task Plan: 继续完成开发需求

## Goal
提交并推送已完成的两个功能分支（uiux-polish-v3 与 brand-pack-data-closure），然后继续开发 Stage4 render self-audit skill-mechanism MVP。

## Current Phase
Phase 5 (complete)

## Phases

### Phase 1: 提交并推送已完成分支
- [x] 在 uiux-polish-v3 worktree 中审查 diff 并提交
- [x] 推送 uiux-polish-v3 到远程
- [x] 在 brand-pack-data-closure worktree 中审查 diff 并提交
- [x] 推送 brand-pack-data-closure 到远程
- **Status:** complete

### Phase 2: Stage4 render self-audit MVP 规划
- [x] 阅读 Stage4 相关代码（worker/stage4_ffmpeg.py、timeline_sync.py）
- [x] 理解当前 self-audit 与 JSON diagnostics 能力
- [x] 在 findings.md 中记录技术方案
- [x] 选定 Stage4 skill-mechanism 架构并更新 task_plan.md
- **Status:** complete

### Phase 3: Stage4 skill-mechanism 实现
- [x] 实现 render self-audit 入口与 JSON report 扩展
- [x] 添加 lens/element/bound-frame 变量覆盖检查
- [x] 更新相关类型与测试
- **Status:** complete

### Phase 4: 测试与验证
- [x] 运行 make test-guide-server
- [x] 运行 make test-guide-fast
- [x] 运行 lint / typecheck（如可能）
- **Status:** complete

### Phase 5: 交付
- [x] 汇总改动并报告给用户
- **Status:** complete

## Key Questions
1. Stage4 render self-audit 的触发时机是什么？（渲染前 / 渲染后 / 按需）
2. JSON diagnostics 需要包含哪些字段？
3. 是否需要新增 skill 配置或保持现有 worker pipeline 兼容？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 先提交并推送两个已完成分支 | 保持主仓库干净，避免后续新工作与未提交改动混在一起 |
| 在独立 worktree 中开发 Stage4 MVP | 与已完成的两个分支隔离，便于分别 review 和 PR |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| CLAUDE_PLUGIN_ROOT 未设置，session-catchup.py 路径错误 | 1 | 使用绝对路径调用脚本 |

## Notes
- uiux-polish-v3 worktree: `.worktrees/uiux-polish-v3`
- brand-pack-data-closure worktree: `.worktrees/brand-pack-data-closure`
- 当前 main HEAD: `96d64c7`
- 推送到远程前确认远程仓库存在且有权写入
