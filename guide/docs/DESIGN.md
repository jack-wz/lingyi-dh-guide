# 零一数字人导购平台 — 设计规范（V3）

> impeccable / taste-skill 取向：降低 AI 味、强化层级、简化入口  
> 日期：2026-06-16 | 执行计划：`OPTIMIZATION_PLAN_V3.md`

## 设计原则

1. **一处维护，处处选择** — 资产库负责 CRUD；编辑器只有「选择器 + 画布编排」。
2. **品牌包优先** — 颜色、字体、字幕、镜头、BGM 从同一品牌包流出，避免编辑器内再建一套。
3. **预览即信心** — 右侧预览面板 / HF 内嵌预览，让用户看见再生成。
4. **克制动效** — 仅 Tab 切换、卡片选中、生成进度使用 150–200ms ease；无 gratuitous 渐变与 bounce。
5. **quiet 导航** — 主 Nav 仅 3 项：资产库、模板中心、我的视频；训练与调试降级。

## 信息架构

```
资产库 /assets
├── 数字人      → 卡片 + 预览 + 「去训练」
├── 模板        → 封面 + 「编辑」
├── 品牌包 ★    → design/frame 预览 + 字体/镜头/预设子 Tab
├── 声音        → TTS | BGM 子 Tab + 试听
├── 脚本        → 全文预览 + 来源标签
├── 知识库      → 目录 only；文档区「开发中」灰态
└── 媒体        → 图/视频网格 + 试听

模板中心 /
└── 新建 / 预置卡片 → 编辑器

编辑器 /editor/:id
├── 顶栏：项目名 | 选数字人 | 选品牌包 | 选脚本 | 生成
├── 左：分镜条（主）
├── 中：画布 + 脚本工作区 + 时间轴
└── 右：设计 | 场景 | 图层 | 生成（审查门）
```

## 品牌包 UI（对齐 opentalking + HyperFrames）

### 品牌包卡片

- 主色条 + 品牌名 + category 标签（general/beauty/food…）
- 副信息：`N 字体 · M 镜头 · K 预设`
- 选中态：1px brand-blue ring（已有，保持）

### 品牌包详情（资产库内，非编辑器）

| 子 Tab | 内容 | 预览 |
|--------|------|------|
| 概览 | 色板、圆角、间距 token | 9:16 迷你画布 |
| 字体 | `typography.fonts` 表格 | 字号样例「永」 |
| 镜头 | `frames[]` 列表 | shotType 图标 + duration |
| 预设 | subtitle/text/layout 折叠 | 字幕条 mock |
| 源文件 | design.md / frame.md 只读 | 语法高亮折叠 |

### 编辑器内品牌选择

- 单按钮「品牌包：{name}」→ 弹窗仅列表 + 右侧预览（无 CRUD）
- 应用后：globalConfig + 当前镜 subtitle + 可选 layout 建议（非强制改全片）

## 字体库

- **不单独顶栏 Tab**（减少认知）：挂在品牌包 · 字体子 Tab。
- 字段：`name` / `family` / `class` / `style`；可选 `preview_text`。
- 编辑器：文本 object / 字幕 style 下拉按当前品牌包字体过滤。
- 渲染：ASS / HF composer 传 `fontFamily`（P0 先预览，成片 P1）。

## 视觉层级（/bolder + /quieter）

| 层级 | 元素 | 处理 |
|------|------|------|
| L1 | 主 CTA「生成视频」 | 实心 primary，固定右栏底 |
| L2 | 选品牌/数字人/脚本 | 顶栏 ghost 按钮，已选显示名称 |
| L3 | 资产库 Tab | pill，选中 cyan/brand-blue 填充 |
| L4 | 卡片元数据、标签 | 10–11px muted，source 小蓝标 |
| 降噪 | 调试、流水线 key、provider 名 | 移入生成审查高级区 |

## 色彩与排版（去 AI 味）

- **避免**：大面积紫渐变、每卡不同霓虹色、居中巨型 emoji 占位。
- **采用**：`bg-background` + `border-border` 卡片；品牌色只来自品牌包 token。
- 字体：UI 用系统栈；成片字体仅来自品牌包 catalog。
- 空状态：一句说明 + 单按钮，无三行 bullet 教程。

## 交互简化（降低门槛）

### 入门三步（首次访问模板中心）

1. 「同步外部素材库」（若脚本/品牌为空）
2. 「用导购预置模板创建」
3. 跳转编辑器并 **自动打开「选品牌包」**

### 编辑器减法

- 移除顶栏「预置」与资产库重复 → 合并到模板中心。
- 左侧默认 **仅分镜条**；素材用顶栏工具 Launcher 浮层（cenker 模式），不默认展开 6 子 Tab。
- 生成前 **强制审查弹窗**（已有 RenderReviewDialog）：缺数字人/脚本可点击跳转选择器。

### 知识库

- 文档区统一文案：「文档上传与检索开发中」+ 单一「知道了」。
- 不展示不可用的「添加文档」主按钮（/distill）。

## 动效（/animate 克制）

- Tab：`transition-colors 150ms`
- 预览面板切换：`opacity 200ms`（无 slide）
- 生成进度：stage 步进条，无脉冲动画

## HyperFrames 预览

- ✅ 编辑器画布内 **HF 实时** iframe（seek 同步 `currentTime`）；角标可改为用户向文案「实时预览」。
- 品牌包镜头带 `hyperframesTemplate` 时，预览角标显示 HF 图标。
- P0：`injectBrandTokens` 后字幕样式与品牌包 preset 一致；P1 Worker ASS 字体对齐。

## 组件清单（待实现）

| 组件 | 职责 |
|------|------|
| `BrandPackPanel` | 品牌包子 Tab（字体/镜头/预设） |
| `BrandPackPicker` | 编辑器专用，替换扁平 brand 列表 |
| `FrameTemplatePicker` | 按品牌包 frames 添加分镜 |
| `FontPreviewRow` | 字体库行预览 |
| `ImportCatalogBanner` | 首次空库引导同步 |

## 可访问性

- 卡片 `role="button"` + Enter（已有）
- 音频预览 `controls` + 文案 fallback
- 色板不仅依赖颜色：附带 hex 文本

## 设计审计清单（/audit — V3）

- [ ] 导航是否 ≤4 项对运营可见
- [ ] 编辑器是否无「维护资产」表单
- [ ] 品牌包是否展示字体+镜头数量
- [ ] 空状态是否单路径引导（同步外部库）
- [ ] HF 预览是否与品牌字幕样式一致（待品牌 token 注入）
- [ ] 是否移除硬编码 BRAND_KITS 视觉
- [ ] 知识库是否无假「上传文档」主按钮（/distill）
- [ ] 资产库主次 Tab 视觉是否区分（品牌/人/脚本 vs 其余）

## taste-skill 审查摘要

| 命令 | 结论 |
|------|------|
| /audit | 七 Tab 等权、知识库假功能、空状态缺引导 — 优先修 |
| /distill | 合并重复入口；知识库仅「开发中」 |
| /quieter | 次 Tab 描边弱化；去掉装饰渐变 |
| /bolder | 品牌色板大色块；选用态左侧色条 |
| /animate | 仅 150–200ms Tab/选用反馈 |
| /critique | 双数据源品牌、预览≠成片字体 — 产品信任风险 |