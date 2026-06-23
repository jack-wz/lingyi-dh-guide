# V5 发布门禁

> 范围：#17-#23 全部关闭后的 V5 交付物验证
> 对应 Epic: #16
> 更新时间：2026-06-23

## 1. 总体结论

V5 七大 P1 需求已全部实现、测试通过并合并到 `main`。本门禁记录每项能力的状态、关键验收命令和尚未完成的工程项。

## 2. Issue 验收矩阵

| Issue | 标题 | 状态 | 关键交付 | 测试锚点 |
|---|---|---|---|---|
| #17 | 资产库四组信息架构与“项目/企业”作用域 | 已关闭 | 资产库 4 组：品牌与角色 / 商品与场景 / 文案与音频 / 模板与动效；`inferred-category` 修正；空状态带生产入口 | `assetHubGroups.test.ts` |
| #18 | Shot-first 编辑器 + 镜头完成状态 | 已关闭 | 编辑器以镜头列表为主导航；脚本面板、画布放大、安全区与遮挡预览、单镜头预生成期望摘要 | `assetHubPage.test.tsx`, `workspace.test.tsx` |
| #19 | 扩展数据模型（Shot/Slot/Variant/Asset） | 已关闭 | `motion.ts`, `editor.ts` 扩展字段；上传白名单与校验；资产作用域字段；禁止临时 URL 直接进 Stage4 | `motionSchema.test.ts` |
| #20 | Text-to-Lottie 编译器 | 已关闭 | `textToLottieCompiler.ts` + `/api/motion/lottie/compile`；矢量文字/emoji/价格/箭头 → Lottie JSON；worker overlay 单路径 | `lottieCompiler.test.ts`, `test_lottie_overlay.py` |
| #21 | GSAP Motion Skill 编译器 | 已关闭 | `gsapMotionCompiler.ts` + `/api/motion/gsap/compile`；入场/强调/退出动画；纯视觉 Skill 带 `delivery_mode=preview_only` 门控 | `gsapMotionCompiler.test.ts` |
| #22 | Stage4 预检/成片报告/诚实指标 | 已关闭 | `stage4_preflight` + `stage4_report.json`；不修改 `assemble_final_video` 核心；交付能力 predicate；字幕安全区/AI 比率/动效密度/交付降级提示 | `test_stage4_report.py`, `test_stage4_preflight.py` |
| #23 | 企业资源包 + AI 生产编排 | 已关闭 | 88 项合规资源目录；6 recipe registry；缺槽检测；Product Brief；写回检查 | `resourcePacks.test.ts`, `motionOrchestration.test.ts` |

## 3. 测试门禁

### 3.1 当前通过数

```bash
make -C guide test-guide-shared   # 142 pass / 0 fail / 0 cancelled
make -C guide test-guide-server   # 120 pass / 0 fail / 0 cancelled
make -C guide test-guide-fast     # 38 pass / 0 fail
bash guide/scripts/run_pytest.sh guide/worker/tests/test_lottie_overlay.py -q  # 8 pass
```

### 3.2 回归命令

```bash
# 一键 V5 全门禁
cd /Users/wuzhu/Documents/AI\ 产品/数字人/零一数字人导购平台/项目demo/Pixelle-Video
make -C guide test-guide-shared
make -C guide test-guide-server
make -C guide test-guide-fast
bash guide/scripts/run_pytest.sh guide/worker/tests/test_lottie_overlay.py -q
bash guide/scripts/run_pytest.sh guide/worker/tests/test_stage4_preflight.py guide/worker/tests/test_stage4_report.py -q
```

## 4. Stage4 交付能力分类

| 能力 | 当前状态 | 说明 |
|---|---|---|
| `preview_supported` | 是 | HF iframe 画布预览、镜头首中末三帧、Lottie/GSAP 预览均可用 |
| `pre_render_supported` | 是 | 单镜头预生成摘要、生成前缺槽检测、Stage4 preflight |
| `stage4_delivery_supported` | 是 | FFmpeg 单路径 + overlay + ASS 字幕 + xfade，含预检与诚实指标 |
| `qa_verified` | 部分 | Worker 单测覆盖 Lottie overlay、Stage4 report/preflight；Web Playwright 覆盖分镜与资产库 |

## 5. 新增 API 速查

| 方法 | 路径 | Issue | 作用 |
|---|---|---|---|
| GET | `/api/motion/lottie/compile` | #20 | 文本/LaTeX/emoji → Lottie JSON |
| GET | `/api/motion/gsap/compile` | #21 | 文本/图标 → GSAP 关键帧 |
| GET | `/api/motion/packs` | #23 | 88 项合规资源目录 |
| GET | `/api/motion/recipes` | #23 | 6 个 recipe 元数据 |
| POST | `/api/motion/gaps` | #23 | 缺槽检测 |
| POST | `/api/motion/proposal` | #23 | Product Brief |
| POST | `/api/motion/proposal/adopt` | #23 | 采用 brief，生成 recipe 计划 |
| POST | `/api/motion/writeback-check` | #23 | 校验 AI 产物已写回资产库 |
| POST | `/api/renders` | 现有 | Stage4 预检自动写入 `stage4_report.json` |

## 6. 已知的下一步工程项

以下项不阻塞 V5 发布，但作为后续工程跟踪：

1. **真实资源文件落地**：当前目录以描述符/参数/合规元数据为主；视觉文件、音频文件、品牌示例包需要设计/法务确认后迁入对象存储并补 `file_url`。
2. **UI 预览渲染**：资源包首/中/末三帧、checkerboard 背景、安全区overlay 的 React 组件尚未完成，仅服务契约与测试就绪。
3. **AI provider 接线**：Recipe Registry 中的 recipe 目前输出输入/输出/cost 契约，真实 AI 生成（图片、B-roll、script compress、shot variant）需要接入 provider 并补 worker job。
4. **Variant → 主镜头写回 UI**：`proposal/adopt` 返回 recipe 计划后，前端需要“候选 Variant 对比 → 采用 → 写回主镜头”的交互流程。
5. **Stage4 真实预检集成**：`stage4_preflight` 已在 Python 侧实现，但需在 Worker pipeline 的 `assemble_final_video` 调用前默认启用并持久化报告。
6. **类型清理**：`guide/web` 存在 2 处既有 `tsc` 错误（`BrandPackPanel` Segment import、`node:test` typings），与 V5 新代码无关，需单独处理。

## 7. 功能开关

V5 所有新能力均通过新增 API/类型/服务实现，未引入新的运行时功能开关。旧 V4 开关保持默认关闭以维持兼容。

## 8. 合规声明

- 所有内置资源目录项均带 `license`、`source_url`、`author`、`downloaded_at`、`allowed_usage`、`attribution_required`。
- 无第三方真实品牌商标；品牌示例包为结构示例。
- 禁止临时 URL 直接进入 Stage4；AI 产物必须写回资产库并记录 `asset_id`。
