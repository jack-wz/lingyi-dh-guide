# Template Editor Experience Audit

## 结论

当前 demo 已从视频编辑器骨架升级为可操作的模板编辑工作台：模板列表、素材面板、场景胶片、画布、脚本区、Design/Scene/Object Inspector、时间轴、生成复核、渲染任务和历史记录已形成闭环。实现目标是产品等价的非协作编辑体验，而不是像素级复刻或接入 Synthesia 私有接口。

本次优化遵循抽象参考原则：不复刻 Synthesia 的私有 DOM、具体视觉细节或隐藏交互，只抽取通用编辑器模式。

## 可复刻能力

- 多场景视频结构：用 segment 表达 scene，已可承载场景列表、画布预览、时间轴和逐段属性。
- 数字人素材选择：已有数字人管理、素材状态和编辑器内选择。
- 模板驱动生成：已有 DSL、变量、分段文案、场景描述、字幕、转场和渲染任务。
- 任务跟踪：已有 render job、日志、进度、重试、取消、复制。

## 已关闭的核心缺口

- 工具入口模型错位：已从顶部“文字/Logo”具体动作改为数字人、文字图形、素材、互动 4 个主工具入口；字幕、形状、动作、录屏作为二级能力收进对应弹层，再写入当前场景或打开对应素材库。
- 场景级导航：已补齐场景胶片、搜索、诊断、新增、复制、删除、拖拽/按钮重排。
- 生成动作过早：已改为 Generate 复核弹框，展示参数、状态、阻塞项和跳转修复入口。
- 画布与属性联动弱：已补齐画布对象选中、选中对象悬浮工具条、Scene 图层列表、Object Inspector、时间轴/场景同步。
- 素材面板过度常驻：已支持收起素材面板，并由工具弹层按 Avatar/Media/Motion/Captions 等上下文重新打开，减少主画布被挤压。
- 生成配置过度常驻：已把 pipeline/input 生成配置压缩成“稳定生成”状态条，默认只显示流水线、输入摘要、数字人状态和阻塞项，展开后才显示详细配置。
- 生产状态表达不足：已补齐保存状态、未保存离开保护、站内确认/错误弹框、缺失输出文件容错。
- 删除链路资源不闭环：已补齐 render/template/digital-human 删除时的输出文件和 worker artifact 目录清理，并限制清理范围只能落在 `DATA_DIR/renders/` 子目录内。
- 自定义素材不足：已补齐背景图、Logo、BGM、贴片/图片对象的上传或 URL 输入。
- 测试入口缺失：已新增根级 `npm test`，服务端用 Node 原生 test 覆盖 pipeline metadata / pipeline_key 校验 / output_exists 容错，并通过真实 Express app + 临时 SQLite DATA_DIR 覆盖 render API 集成链路；worker 用 unittest 覆盖模板变量替换、时间轴计算、overlay 全局时间映射和 pipeline registry 行为。

## 明确排除或后续增强

- 协作不开发：Chat、Invite、多人评论、权限、审核流明确排除。
- 不依赖 Synthesia 私有 DOM、私有接口或版权素材。
- 真实一键 AI 分镜、品牌资产权限/审核、批量样式同步、多轨真实音频波形、逐词口型时间码、自动保存版本快照属于后续增强，不作为本次非协作编辑复刻的阻塞项。

## 设计原则

- 使用三栏生产布局：资产库、场景导航、主编辑区、属性面板。
- 生成前必须有 review gate：明确阻塞项、风险项和将要提交的参数。
- 把 scene 当作一等对象：可新增、复制、删除、选择，画布与时间轴同步。
- 避免依赖 alert：错误、阻塞和确认应在界面中可见、可复核。
- 保留当前 DSL 和 worker 架构，先补交互闭环，再扩展 AI 自动创作。

## 本轮已实现

- 编辑器新增场景导航栏，支持片段选择、新增、复制、删除。
- 场景导航增加缺口诊断徽标，用于提示缺脚本、缺场景、时长异常。
- 场景导航补齐搜索、上下重排和拖拽重排，场景顺序直接写入 DSL segments。
- 中央画布下方新增脚本工作区，将数字人口播文案从右侧属性表单中提升为主工作流。
- 画布支持通用对象层，文本/Logo/图片贴片可选中、拖拽，并同步右侧 Object Inspector。
- 右侧新增 Design / Scene / Object 三标签面板，Design 面板覆盖背景色、背景媒体、音乐、音量、循环、场景转场、品牌色、Logo、字幕样式、画布比例和输出规格；Scene 面板覆盖场景类型、layout、时长、参考图、场景描述、镜头、数字人/声音 ID、字幕和贴片层。
- Scene 面板新增图层列表，Object 面板支持通用对象和贴片的复制、删除、前移/后移与显隐编辑。
- Design / Scene / Object 面板接入上传控件，支持上传或 URL 配置背景参考图、品牌 Logo、BGM、贴片/图片对象素材。
- 顶部显示项目名编辑、保存状态、撤销/重做、预览、对象插入和 Generate 入口。
- 顶部工具入口调整为 Synthesia-like 工具启动器：数字人打开数字人素材库，文字图形提供 Title/Subtitle/Body/Caption、形状和字幕样式，素材提供场景/音效/动作素材、图片/Logo、录屏上传与浏览器屏幕录制，互动可插入可选中、可保存、可排版的互动对象。
- 工具启动器补齐 `aria-label` / `data-tool`，并支持点击外部或 Escape 关闭，避免弹层残留，也便于浏览器自动化回归。
- `objects[]` 增加可选 `interaction`、`metadata`、`style` 字段，旧 DSL 兼容；互动 Button/Branching Menu/Single Answer/Multiple Answers/Score Card 和录屏素材都走同一对象编辑链路。
- 新增 `server/src/render-utils.ts`，把 pipeline metadata、pipeline 校验和输出文件存在性判断从路由中抽为可测试纯函数；`server/src/routes/renders.ts` 保持原 API 行为不变。
- 新增 `server/src/app.ts`，把 Express app 创建与端口监听拆开；测试可用临时 `DATA_DIR` 和 `DISABLE_RENDER_WORKER=1` 覆盖真实 DB/worker，避免污染本地数据或启动后台 worker。
- 新增 render API 集成测试，覆盖创建任务、worker claim、进度 PATCH、日志写入/读取、取消冲突、取消终态竞态保护、duplicate、pipeline 校验、digital-human ready 校验、failed retry 和 retry limit。
- render PATCH 增加终态保护：`completed` / `failed` / `cancelled` 后不再允许 worker late update 覆盖结果；`cancelling` 状态只接受 worker 最终落到 `cancelled`，拒绝晚到的 failed/completed。
- 新增 worker 心跳超时维护接口 `POST /api/renders/maintenance/timeouts`，活动任务心跳过期后会自动标记 failed、写入错误日志，并由测试覆盖 SQLite 时间格式解析和真实 API 落库链路。
- worker 的 `PipelineContext` / `PipelineRegistry` 导入路径改为懒加载类型依赖，避免仅导入 registry 就拉起 provider client，降低测试和启动耦合。
- worker Stage 3/Stage 4 增加 FFmpeg 前置检查，缺少 FFmpeg 时返回稳定的依赖错误；Stage 3 provider client 改为函数内懒加载，故障注入测试不再依赖外部 provider SDK 依赖。
- worker provider client 增加 `ProviderTimeoutError` 归一化：KIE、YunTTS、WaveSpeed 的请求超时和异步任务轮询超时会抛出稳定错误，避免被普通 `except Exception` 吃掉后继续 fallback。
- worker 主循环已接入 heartbeat timeout 维护 tick，会按间隔调用 `/api/renders/maintenance/timeouts` 自动失败失联 worker 遗留的活动任务；维护请求失败不会中断正常取任务。
- 新增 Playwright 浏览器 E2E smoke：可按 `E2E_API_URL` / `E2E_BASE_URL` 独立启动测试端口，创建模板、进入编辑器、打开文字图形/互动工具、打开 Generate 复核弹框；同时覆盖 render 任务页取消、失败重试、复制再生成，以及个人中心下载入口和缺失输出文件 fallback，并断言无 console error / request failed。
- 左侧素材库默认收起，避免与场景胶片同时长期挤占画布宽度；工具弹层和流程引导会按上下文重新打开对应素材标签。
- 生成控制从常驻大面板改为可展开的稳定生成条，保留 pipeline/input/topic/script 能力，同时减少对主编辑区的干扰。
- 画布选中对象新增悬浮工具条，支持对象/贴片复制、删除，数字人/字幕隐藏；通用对象新增画布内缩放和旋转手柄，降低对右侧 Object 面板的强依赖。
- 右侧 Inspector 现在跟随画布选择：选中场景切 Scene，选中对象/贴片/数字人/字幕切 Object，取消对象选择后从 Object 回到 Scene，避免选中对象时仍误改 Design 全局设置。
- Design 面板顶部新增 Scene layout / Replace 控制，优先表达当前场景布局与背景替换，和 Synthesia 右侧默认面板更一致。
- 编辑器支持 Cmd/Ctrl+S 保存、Cmd/Ctrl+Z 撤销、Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y 重做；未保存时刷新或返回会提示保存/放弃。
- 时间轴新增播放头时间同步、轨道静音、片段新增、片段 resize、视频 clip 拖拽重排，并补齐新 DSL 字段默认值。
- 素材库选择场景、字幕、音效和动画后会标记模板未保存，避免用户误判保存状态。
- 模板、数字人、渲染历史和任务页的创建/删除/取消/错误反馈改为站内弹框，不再依赖浏览器原生 prompt/confirm/alert。
- 个人中心视频卡片补齐可访问名称和键盘打开能力，浏览器测试可按具体任务 id 验证下载入口与缺失文件 fallback。
- render 任务日志轮询增加按日志 id 去重，避免并发轮询或 React StrictMode 下重复追加日志造成 duplicate key 和重复展示。
- 生成按钮改为打开确认弹框，弹框展示 pipeline、输入模式、数字人状态、预计时长、成本/耗时预估、供应商/运行环境诊断和阻塞项；阻塞项可点击跳转到对应场景、素材库或 Inspector。
- 生成复核增加文案、场景、品牌、音乐、转场的状态检查。
- 新增 `/api/config/diagnostics`，按 `DATA_DIR` 读取配置并返回 KIE、YunTTS、WaveSpeed、FFmpeg 的脱敏可用性；生成条和复核弹框会显示当前 pipeline 的硬阻塞与降级风险。
- Design 面板新增团队级品牌资产库：预设和服务端持久化团队套件可一键同步品牌色、背景色、字体、字幕样式，并在当前场景补齐/更新 Logo、品牌标题和片尾 CTA 对象；离线时保留 localStorage 兜底。
- 历史任务输出文件缺失时不再盲目加载视频，避免 404 噪声。
- topic/script 生成输入不再只是 UI/DB 字段：`POST /api/renders` 会校验输入模式和必填内容，worker claim 时会把主题或固定脚本物化为本次任务专属 segment DSL，避免 worker 继续消费旧模板文案。
- 编辑器 `objects[]` 不再停留在预览层：worker Stage 1 会把可见的文本、Logo、图片、贴片、互动和录屏占位对象规范化为全局 overlay 时间线，并替换对象文本/URL/互动选项中的模板变量；Stage 4 会为无素材 URL 的文字/Logo/互动/录屏对象生成透明 PNG，占位层可进入最终 FFmpeg 合成。
- 对象合成尺寸语义已对齐编辑器：由 `objects[]` 生成的 overlay 会携带对象基础宽高比例，`scale=100` 表示对象自身默认尺寸；旧 `overlays[]` 仍保留原来的全画布比例语义，避免破坏历史模板。
- 中文生产场景补强：固定脚本模式的长中文段落会按中英文标点聚合拆分为多个 segment，无标点时按长度兜底；生成侧对象占位图支持无空格中文长文本按字符宽度换行，避免文字横向溢出。
- 生成侧对象占位 PNG 增加跨平台 CJK 字体 fallback：优先尝试 STHeiti、Songti、Arial Unicode、Noto Sans CJK、WenQuanYi，再降级到默认字体，避免中文文字/互动/录屏占位在导出视频中变成空框或乱码。
- 数字人训练从 sleep/mock 文案升级为显式资产状态机：新建默认 `pending_assets`，缺素材会保留缺口错误；完整本地资产包会写入 `local-assets`、`local-voice:*`、`local-image:*` 并进入 `ready`；provider/async 模式会进入 `training`，再由 `/training-status` 回调落到 `ready` 或 `failed`，保留 provider job ID 和错误原因。
- 删除闭环补齐：`DELETE /api/renders/:id` 会删除 render logs、job、`/renders/*.mp4` 输出文件和 `renders/job_<id>` 工作目录；删除模板或数字人时会先收集关联 job，再级联清理日志、任务和输出 artifacts；模板删除确认文案已同步为真实级联行为。
- DSL 生产基线对齐：`shared/types/template.ts` 已从旧 camelCase 结构改为当前客户端/worker 实际使用的 snake_case DSL；服务端 `POST /api/templates` 复用共享 `createDefaultDSL()`，新建模板默认带 `background_color`、`bgm_enabled`、`bgm_loop`、`transition_enabled`、`brand_color`、`output_resolution`、`aspect_ratio`、`layout`、`avatar_id`、`voice_id`、`objects[]` 和 `diagnostics[]`，不再只依赖编辑器打开时兜底补字段。
- 任务终态一致性补齐：worker 异常路径会明确上报 `stage=failed`；服务端 PATCH 在收到 `completed` / `failed` / `cancelled` 终态但缺少 stage 时，会自动把 stage 归一为同名终态，避免历史页和任务页出现“状态失败但阶段仍是 parsing/video_gen”的错位。
- worker 进度回写稳态补齐：`PATCH /api/renders/:id` 会校验 status、progress 和日志 level，非法回写返回 400；真实 worker 只上报 `stage/progress` 时，服务端会把 `scene_gen`、`video_gen`、`ffmpeg` 以及 `assemble -> ffmpeg` 同步到 job status，避免任务页长期停留在 parsing。
- render job 可复现性补齐：创建任务时会保存 `template_dsl_snapshot`；worker claim 优先使用 job 快照，retry/duplicate 继承父任务快照，避免模板后续编辑污染已排队或重试的生成任务。
- provider 配置快照落地：创建任务时保存未脱敏的 `provider_config_snapshot`，普通 render API 响应递归脱敏 key/token/secret；worker claim 获取原始快照并在本次 job 执行期间覆盖 `worker.config` 的 provider/pipeline/prompt 读取，任务结束后清理，避免后续配置变更影响已入队任务。
- worker claim 响应一致性补齐：`GET /api/renders/next` 成功领取后会重新读取 job 并返回 `parsing`/`worker_id` 最新状态；队首 queued job 被其他 worker 抢占时会短暂重试下一条 queued job，降低多 worker 轮询下的无效 409。

## 实现覆盖矩阵

| 模块 | 参考交互模式 | 当前覆盖 | 仍不做/后续 |
| --- | --- | --- | --- |
| 顶部栏 | 返回、项目名、保存状态、撤销/重做、工具启动器、预览、生成 | 已覆盖，工具弹层收敛为数字人、文字图形、素材、互动 4 个主入口；Generate 进入复核弹框 | Invite、权限、多人协作不做 |
| 保存与离开 | 保存状态、快捷键、离开保护、刷新保护 | 已覆盖 Cmd/Ctrl+S、撤销/重做快捷键、未保存返回/刷新提示 | 自动保存版本快照可后续增强 |
| 场景胶片 | 缩略图、当前高亮、诊断、新增、复制、删除、重排、搜索 | 已覆盖，旧 DSL 缺缩略图时回退场景图/占位，支持按钮和拖拽重排 | 多选批量操作可后续增强 |
| 主画布 | 背景、数字人、字幕、贴片对象、选中态、悬浮工具条、拖拽、缩放、旋转 | 已覆盖基础对象模型、画布拖拽、复制/隐藏/删除快捷操作，以及通用对象画布内缩放/旋转手柄；可见 `objects[]` 会进入 worker overlay 时间线和最终 FFmpeg 合成，并保留接近编辑器预览的对象尺寸语义；无素材 URL 的中文对象占位会使用 CJK 字体 fallback 生成可读 PNG | 多选对齐和吸附线可后续增强 |
| 脚本区 | 当前场景文案、时长、语言/声音状态、数字人/字幕快捷开关 | 已覆盖 | 多语言配音和逐词时间轴未接入 |
| 右侧 Inspector | Design / Scene / Object 属性编辑 | 已覆盖三类面板，Design 顶部补 Scene layout/Replace，Scene 管场景级信息和图层列表，Object 支持数字人/字幕/贴片/通用对象复制删除和层级调整；画布选择会自动切到匹配 Inspector，手动切换 Design/Scene/Object 不会被同一选择状态反复覆盖 | 批量样式同步可后续增强 |
| 设计配置 | 背景、音乐、转场、字幕、品牌、输出规格 | 已写入 DSL globalConfig 和 segment 字段；共享 DSL 类型和服务端默认模板已对齐这些字段；品牌资产库支持预设和服务端团队套件 CRUD，可保存色板、字体族、字幕规范、Logo 标签、品牌标题和片尾 CTA，并同步到当前场景对象 | 字体文件上传、品牌权限/审核和跨项目治理可后续增强 |
| 时间轴 | 播放头、缩放、轨道、clip 选择、resize、新增、重排 | 已覆盖，时间轴新增片段补齐新 DSL 字段，视频 clip 拖拽可重排场景 | 多轨真实音频波形和逐词口型时间码未做 |
| 素材库 | 场景、字幕、音效、动画、数字人选择 | 已覆盖并联动未保存状态；素材面板默认收起，由顶部工具和流程引导按需打开；编辑面板支持背景图、Logo、BGM、贴片/图片对象上传或 URL 输入；素材弹层可发起浏览器屏幕录制并上传为 `/uploads/*.webm` 视频对象，也可手动绑定 MP4/WebM，未绑定时生成可合成占位层 | 外部素材管理和素材文件夹仍是后续增强 |
| 弹框与确认 | 创建输入、删除确认、取消任务、错误反馈、视频播放 | 已覆盖站内弹框，浏览器原生 alert/confirm/prompt 已移除 | Toast 队列和批量操作确认可后续增强 |
| 生成复核 | pipeline、输入模式、数字人、场景数、时长、成本/耗时风险、供应商诊断、阻塞项、跳转修复 | 已覆盖，生成配置默认压缩为状态条，展开后可编辑 pipeline/input；按场景数、时长、输出规格、pipeline 和供应商诊断给出确定性成本/耗时风险预估；供应商/API key/FFmpeg 诊断会显示硬阻塞和降级风险；阻塞项可跳转对应场景/素材库/Inspector，提交继续走 POST /api/renders；topic/script 输入会在 worker claim 前物化为任务 DSL，长中文脚本可按句拆分 | 暂不计算真实供应商账单费用；真实 LLM 分镜规划可后续替换当前确定性草稿 |
| 任务闭环 | render 页面、取消、重试、复制、下载、缺失文件容错、删除清理、终态一致性、失联任务超时、进度回写校验、任务输入快照、claim 响应一致性 | 已由前一轮生产化改造覆盖；删除 render/template/digital-human 时会同步清理日志、任务、输出文件和 worker artifact 目录，并保护 `DATA_DIR/renders/` 之外的文件不被误删；worker/API 终态更新会归一 `status` 与 `stage`；stage-only 进度回调会推进 status；非法 worker status/progress/log level 会返回 400；worker loop 会自动触发 heartbeat timeout 维护，失联任务可落到 failed；job 创建时保存模板 DSL 和 provider 配置快照，retry/duplicate 复用快照，普通 API 脱敏但 worker 执行使用原始快照；worker claim 成功响应返回领取后的 `parsing` 状态并在队首抢占时重试下一条 queued job | 并发队列监控面板可后续独立做 |
| 模板生命周期 | 草稿、待发布、发布、下线、版本和发布时间 | 已新增受控状态流转接口 `PATCH /api/templates/:id/status`，模板中心支持提交待发布/发布/下线/恢复草稿；发布会递增版本、写入 `published_at`，并同步 DSL meta | 不做多人审核、权限审批和评论流 |
| 自动化测试 | 模板解析、pipeline 选择、进度/输出状态、缺失文件容错、删除路径回归、DSL 默认值 | 已新增 `npm test`，覆盖 template lifecycle、服务端新建模板生产 DSL 默认字段、config diagnostics、uploads DATA_DIR/webm 静态访问、render utils、provider snapshot redaction、render API integration、terminal stage normalization、stage-only status derivation、invalid worker update validation、render job template snapshot、provider config snapshot worker handoff、digital-human training lifecycle、worker provider config snapshot override、worker parse_template、pipeline registry、worker heartbeat timeout、cancel race、render/template/digital-human 删除清理、artifact 路径防逃逸、FFmpeg unavailable、provider timeout、中文对象占位 PNG 实际像素渲染；新增 `npm run test:e2e --workspace=client` 覆盖编辑器浏览器 smoke、供应商诊断展示、任务页取消/重试/复制、个人中心下载入口和缺失输出 fallback；`npm run build` 和 Python 编译继续作为基线 | 移动端断点和真实下载文件流可后续增强 |
| 互动运行时 | CTA、分支、单选、多选、计分卡 | 结果页会读取 render job 的 `template_dsl_snapshot`，按视频当前片段叠加互动层；CTA 可点击并可打开目标链接；单选/分支选项会记录当前选择，并可通过 `target_segment_id` 或 `option_targets` 跳转到目标片段；多选答案会写入 `render_interactions` 并在刷新后恢复；新增 interaction summary 可展示完成率、回答路径、选项命中和计分卡得分；E2E 已覆盖结果页选择反馈、分支跳转、计分分析和刷新恢复 | 跨任务答案聚合、漏斗分析和分支路径可视化可后续增强 |
| 不可复刻项 | 私有 DOM、私有接口、版权素材、协作系统 | 明确排除 | Chat、Invite、评论、权限、审核流不开发 |

## 截图参考映射

- 顶部 Avatar/Text/Shape/Motion/Media/Captions/Interactivity/Record -> 已抽象合并为数字人、文字图形、素材、互动 4 个主入口；素材入口支持浏览器录屏上传为真实视频对象；Chat/Invite 协作入口不开发。
- 左侧纵向场景缩略图 -> 已实现 `SceneNavigator`，并加入场景级诊断。
- 中央画布 -> 继续沿用 `VideoCanvas`，保持主视觉编辑区独立。
- 画布对象选中悬浮工具条 -> 已补复制、删除/隐藏快捷动作，并补齐通用对象缩放/旋转手柄；复杂动画触发仍由右侧 Object/时间轴处理。
- 画布下方脚本区 -> 已实现 `ScriptWorkspace`，支持当前场景脚本和时长编辑。
- 右侧 Design 面板 -> 已实现 `DesignPanel`，顶部先展示 Scene layout/Replace，再覆盖背景、音乐和转场等高频设计项。
- 顶部 Generate 动作 -> 已改为生成前复核弹框，避免直接提交不可逆耗时任务。

## 交互 Roast 与修复决策

- 原交互把“工具选择”和“素材资产管理”混在常驻左栏里，像后台配置页，不像编辑器。修复：顶部工具启动器负责意图入口，左侧素材库只在需要时展开。
- 原顶部的“文字/Logo”按钮太早暴露具体对象类型，缺少 Synthesia 的工具分组。修复：Text/Media/Shape 分别提供变体选择，不改变底层 `objects[]`。
- 原画布选中后只能去右侧找动作，编辑节奏被打断。修复：选中对象在画布上直接给复制、删除/隐藏的最短路径。
- 原右栏默认 Design 面板更像全局设置，不像当前场景 Inspector。修复：Scene layout / Replace 放到第一屏，背景、音乐、转场保留下沉。
- 原素材栏常驻导致左侧资产 + 场景胶片双栏挤压画布。修复：资产栏可收起，并通过 Avatar/Media/Motion/Captions 工具上下文恢复。
- 原生成控制面板常驻导致画布首屏被压低，和 Synthesia 的编辑器空间分配冲突。修复：默认压缩成稳定生成状态条，需要时展开配置。

## 后续建议

- 将当前 topic 确定性分镜草稿升级为真实 LLM 分镜规划，产出更完整的镜头、素材和字幕建议。
- 增强品牌资产治理：增加字体文件上传、品牌权限/审核、跨项目套件发布和批量样式同步。
- 增强互动分析：增加跨任务答案聚合、漏斗分析和分支路径可视化。
- 增加真实费用预测：按实际供应商价格表、输出分辨率和预计时长估算账单费用。
