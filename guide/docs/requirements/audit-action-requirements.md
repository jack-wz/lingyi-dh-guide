# 零一数字人导购平台 — 审计需求清单

> 来源：[`/Users/wuzhu/cola/outputs/全方位审计：零一数字人导购平台/全方位审计报告.md`](../../../cola/outputs/全方位审计：零一数字人导购平台/全方位审计报告.md)  
> 生成日期：2026-06-26  
> 复核方式：GitNexus 不可用期间，改用直接文件读取 + `grep` 统计复核  
> 适用范围：`guide/` monorepo（server / worker / web / shared）+ FastAPI 网关

---

## 说明

本文档将审计报告中的问题转化为可执行、可验收的需求条目。每个条目包含：

- **需求编号**：`REQ-{模块}-{优先级}-{序号}`
- **问题来源**：对应审计报告中的编号
- **现状复核**：已通过代码阅读确认的要点
- **验收标准**：完成后必须满足的条件
- **建议文件/位置**：主要改动点

---

## P0 — 生产部署前必须解决

### REQ-SRV-P0-01 全局错误处理中间件

| 字段 | 内容 |
|---|---|
| 来源 | S-C1 |
| 现状复核 | `guide/server/src/app.ts:82` 直接 `return app;`，无 `app.use((err, req, res, next) => ...)` |
| 需求 | 添加 Express 全局错误处理中间件，捕获未处理异常，返回结构化错误响应，禁止泄露堆栈 |
| 验收标准 | 1. 任何路由抛异常均返回 `apiError()` 格式；2. 非开发环境不返回 `err.stack`；3. 404 之后注册的中间件能捕获路由处理错误 |
| 建议位置 | `guide/server/src/app.ts` 末尾；可复用 `apiErrors.ts` 的 `ErrorCodes.INTERNAL_SERVER_ERROR` |

### REQ-SRV-P0-02 API 认证层

| 字段 | 内容 |
|---|---|
| 来源 | SEC-C1 |
| 现状复核 | `app.ts:34` `app.use(cors())`；所有 `/api/*` 路由直接注册，无任何 auth 中间件 |
| 需求 | 为全部 API 端点增加最小认证层（token/API key/session），未授权请求返回 401 |
| 验收标准 | 1. 所有 `POST/PUT/DELETE` 端点需要认证；2. 静态资源 `/uploads`、`/renders` 按需要求认证或签名；3. `PUT /api/config` 必须受保护；4. 不影响现有 E2E（提供测试 token 机制） |
| 建议位置 | `guide/server/src/middleware/auth.ts` + `app.ts` 全局 `app.use('/api', authMiddleware)` |

### REQ-SRV-P0-03 限制 CORS 来源

| 字段 | 内容 |
|---|---|
| 来源 | SEC-C3、SEC-M2 |
| 现状复核 | `api/app.py:121` 使用 `api_config.cors_origins`；`guide/server/src/app.ts:34` `cors()` 无选项 |
| 需求 | FastAPI 网关与 Express 均只放行明确配置的来源，生产环境禁止 `*` |
| 验收标准 | 1. `api/config.py` / `api/app.py` 不默认 `allow_origins=["*"]`；2. `guide/server/src/app.ts` 读取配置化的 `CORS_ORIGINS`；3. 本地开发可配置为 `localhost:5173` |
| 建议位置 | `api/config.py`、`api/app.py`、`guide/server/src/app.ts`、`guide/.env.example` |

### REQ-WRK-P0-01 修复 FFmpeg drawtext 注入

| 字段 | 内容 |
|---|---|
| 来源 | W-H1 |
| 现状复核 | `guide/worker/worker/stage3_video_gen.py:973`：`f"drawtext=text='{text}':..."`，`text` 取自 `seg.get("narration_text")` 且未转义 |
| 需求 | 对注入 FFmpeg drawtext 滤镜字符串的用户/LLM 文本进行安全转义或改用 ASS/图片占位 |
| 验收标准 | 1. 输入含单引号 `'`、冒号 `:`、反斜杠 `\`、换行时不破坏 FFmpeg 命令；2. 存在对应的单测覆盖恶意输入；3. `subprocess.run` 失败有明确日志 |
| 建议位置 | `guide/worker/worker/stage3_video_gen.py:_generate_placeholder_clip` |

### REQ-WRK-P0-02 清理 pipeline.py 死代码

| 字段 | 内容 |
|---|---|
| 来源 | W-C1 |
| 现状复核 | `guide/worker/worker/pipeline.py:42-173` 提供 `run_pipeline()`，但 worker 实际入口为 `pipelines/__init__.py → BasePipeline.__call__` |
| 需求 | 删除或归档 `pipeline.py` 中的死代码，避免误导开发者 |
| 验收标准 | 1. 无代码引用 `pipeline.run_pipeline`；2. 删除后所有 worker 测试通过；3. 如保留，需明确标记为 deprecated/legacy |
| 建议位置 | `guide/worker/worker/pipeline.py` |

### REQ-WRK-P0-03 修复 stage4_ffmpeg 运算符优先级 Bug

| 字段 | 内容 |
|---|---|
| 来源 | W-H2 |
| 现状复核 | `guide/worker/worker/stage4_ffmpeg.py:338`：`if local and local.lower().endswith(".json") or (url.lower().endswith((".json", ".lottie"))) or "manifest" in delivery_mode:` |
| 需求 | 修正 `and/or` 优先级，使 Lottie/JSON 判定逻辑正确 |
| 验收标准 | 1. 逻辑表达式加括号明确语义；2. `local` 为空时不会错误进入 JSON 分支；3. 相关测试通过 |
| 建议位置 | `guide/worker/worker/stage4_ffmpeg.py:338` |

### REQ-WRK-P0-04 移除生产 print 日志

| 字段 | 内容 |
|---|---|
| 来源 | W-H4 |
| 现状复核 | `grep` 统计 `guide/worker/worker/**/*.py` 中 `print(` 超过 100 处，集中在 `ai_clients/talking_head_client.py`、`ai_clients/kie_avatar_client.py` 等 |
| 需求 | 将生产代码中的 `print()` 替换为 `PipelineLogger`，并确保不打印 API 密钥、完整响应体 |
| 验收标准 | 1. 生产路径无 `print(`；2. logger 分级（debug/info/warn/error）；3. 敏感字段脱敏；4. `make test-guide` 通过 |
| 建议位置 | `guide/worker/worker/ai_clients/*.py`、`stage2_scene_gen.py`、`stage4_ffmpeg.py` 等 |

### REQ-WEB-P0-01 启用前端 TypeScript strict 模式

| 字段 | 内容 |
|---|---|
| 来源 | F-C1 |
| 现状复核 | `guide/web/tsconfig.app.json` 无 `"strict": true`，`noUnusedLocals`/`noUnusedParameters` 均为 false |
| 需求 | 开启 `strict` 并修复由此暴露的类型错误 |
| 验收标准 | 1. `tsconfig.app.json` 包含 `"strict": true`；2. `npm run build` 0 类型错误；3. 必要时先开启 `strictNullChecks`、`noImplicitAny` 等分阶段落地 |
| 建议位置 | `guide/web/tsconfig.app.json` + 全 `guide/web/src/**/*.{ts,tsx}` |

---

## P1 — 下一迭代解决

### REQ-SRV-P1-01 统一 API 客户端（前端）

| 字段 | 内容 |
|---|---|
| 来源 | F-H3 |
| 现状复核 | `guide/web/src/**/*.tsx` + `*.ts` 中裸 `fetch(` 共 85 处，无统一封装 |
| 需求 | 创建共享 API 客户端，统一 base URL、认证头、错误处理、响应类型化 |
| 验收标准 | 1. 新增 `guide/web/src/api/client.ts`；2. 所有现有 `fetch` 调用替换为类型化客户端方法；3. 401 统一跳转/提示；4. 网络错误统一 toast |
| 建议位置 | `guide/web/src/api/client.ts`、`guide/web/src/api/*.ts` |

### REQ-SRV-P1-02 请求体验证框架

| 字段 | 内容 |
|---|---|
| 来源 | S-M4 |
| 现状复核 | 路由中散落手动 `if (!field)` 检查，无 zod/joi 等 schema |
| 需求 | 引入 zod，为关键路由定义请求体验证 schema |
| 验收标准 | 1. `POST /api/renders`、`POST /api/templates`、`POST /api/digital-humans` 等使用 schema；2. 验证失败返回统一 400 + 字段级错误；3. 不影响现有测试 |
| 建议位置 | `guide/server/src/validation/*.ts` + 各路由 |

### REQ-SRV-P1-03 消除 `as any` 类型侵蚀

| 字段 | 内容 |
|---|---|
| 来源 | S-H1 |
| 现状复核 | `guide/server/src/**/*.ts` 中 `as any` 共 74 处，多为 DB 行 cast |
| 需求 | 为 DB 查询结果定义类型或使用 better-sqlite3 的 typed methods |
| 验收标准 | 1. 路由文件 `as any` 数量下降 80% 以上；2. `tsc -b` 通过；3. 新增类型定义覆盖主要表 |
| 建议位置 | `guide/server/src/db/types.ts`、各路由文件 |

### REQ-SHR-P1-01 统一共享类型定义

| 字段 | 内容 |
|---|---|
| 来源 | SH-C1、SH-M1 |
| 现状复核 | `guide/shared/types/editor.ts` 与 `template.ts` 重复定义 `SegmentType/AspectRatio/SubtitlePosition/EditorObjectType/Segment/EditorObject` 等，字段可选性不一致 |
| 需求 | 合并重复类型，明确 editor 与 template 的扩展关系（editor 可视为 template 的编辑期超集） |
| 验收标准 | 1. 无重复类型定义；2. `template.ts` 为 source-of-truth；3. `editor.ts` 通过 `extends` 或 `Omit`/`Partial` 扩展；4. 全项目引用一致 |
| 建议位置 | `guide/shared/types/template.ts`、`guide/shared/types/editor.ts` |

### REQ-WRK-P1-01 临时文件清理策略

| 字段 | 内容 |
|---|---|
| 来源 | W-H3 |
| 现状复核 | stage2/3/4 工作目录无限积累中间文件，无 TTL 或最大保留策略 |
| 需求 | 为渲染工作目录添加清理策略：成功/失败一定时间后自动清理，或按磁盘配额 |
| 验收标准 | 1. 配置项 `work_dir_ttl_hours`；2. worker 启动/任务完成后执行清理；3. 保留最近 N 个失败目录便于排障 |
| 建议位置 | `guide/worker/worker/config.py`、`guide/worker/worker/run_worker.py` |

### REQ-WRK-P1-02 外部 API 断路器/重试策略

| 字段 | 内容 |
|---|---|
| 来源 | 功能完整性审计 |
| 现状复核 | WaveSpeed/KIE 并行调用无节流，无 Retry-After 处理，无断路器 |
| 需求 | 为外部 API 调用添加指数退避重试、429 节流、断路器 |
| 验收标准 | 1. 429 时按 `Retry-After` 等待；2. 连续失败 N 次后短路并标记 job 失败；3. 不重复浪费 API 额度 |
| 建议位置 | `guide/worker/worker/ai_clients/*.py` |

### REQ-WRK-P1-03 Edge TTS 超时

| 字段 | 内容 |
|---|---|
| 来源 | 功能完整性审计 |
| 现状复核 | `asyncio.run()` 无超时，edge-tts 挂起则 job 永久挂起 |
| 需求 | 为 Edge TTS 调用增加硬性超时 |
| 验收标准 | 1. 超时后抛异常并记录；2. job 进入 failed 状态而非 stuck |
| 建议位置 | `guide/worker/worker/local_edge_tts.py`、`tts_adapter.py` |

### REQ-WRK-P1-04 消除 `_JOB_CONFIG_SNAPSHOT` 全局可变状态

| 字段 | 内容 |
|---|---|
| 来源 | W-C2 |
| 现状复核 | `guide/worker/worker/config.py:24,40-48` 模块级全局 dict 无锁保护 |
| 需求 | 将 job 配置快照改为显式参数传递或线程安全上下文 |
| 验收标准 | 1. 无模块级可变全局状态；2. 并发 job 处理时配置不泄漏；3. 测试通过 |
| 建议位置 | `guide/worker/worker/config.py`、调用方 |

### REQ-WEB-P1-01 渲染提交 loading 指示器

| 字段 | 内容 |
|---|---|
| 来源 | F-H6、交互体验审计 |
| 现状复核 | `EditorPage.tsx:370-415` `executeRender` 无加载状态 |
| 需求 | 渲染提交按钮显示 loading，防止重复点击 |
| 验收标准 | 1. 点击后按钮 disabled + spinner；2. 请求完成/失败后恢复；3. 错误时 toast 提示 |
| 建议位置 | `guide/web/src/pages/EditorPage.tsx` |

### REQ-WEB-P1-02 数字人训练轮询改为指数退避

| 字段 | 内容 |
|---|---|
| 来源 | 交互体验审计 |
| 现状复核 | `DigitalHumanDetailPage.tsx` 1s 间隔轮询训练状态 |
| 需求 | 训练轮询使用指数退避，减少无意义请求 |
| 验收标准 | 1. 初始 2s，逐步增加到 30s 封顶；2. 状态变为 ready/failed 后停止；3. 页面不可见时暂停 |
| 建议位置 | `guide/web/src/pages/DigitalHumanDetailPage.tsx` |

### REQ-TST-P1-01 补充 uploads.ts 安全测试

| 字段 | 内容 |
|---|---|
| 来源 | 测试覆盖审计 |
| 现状复核 | `guide/server/src/routes/uploads.ts` 零测试 |
| 需求 | 为上传端点添加安全测试：路径遍历、超大文件、SVG 消毒、Lottie 验证 |
| 验收标准 | 1. 覆盖上述 4 类场景；2. 测试写入 `guide/server/src/routes/uploads.test.ts`；3. `make test-guide-server` 通过 |
| 建议位置 | `guide/server/src/routes/uploads.test.ts` |

### REQ-TST-P1-02 补充 hyperframesComposer.ts 测试

| 字段 | 内容 |
|---|---|
| 来源 | 测试覆盖审计 |
| 现状复核 | `guide/shared/hyperframesComposer.ts` 529 行，核心合成逻辑零测试 |
| 需求 | 为核心合成函数添加单元测试 |
| 验收标准 | 1. 覆盖常见 DSL → HTML 转换路径；2. 覆盖品牌包注入；3. `make test-guide-shared` 通过 |
| 建议位置 | `guide/shared/hyperframesComposer.test.ts` |

---

## P2 — 计划性改进

| 编号 | 来源 | 需求 | 验收标准 |
|---|---|---|---|
| REQ-WEB-P2-01 | F-H4 | 拆分 `EditorPage.tsx`（1121 行） | 拆分为容器 + 多个 panel hooks/components，单文件 < 400 行 |
| REQ-WEB-P2-02 | F-H5 | 拆分 `AssetHubPage.tsx`（1336 行） | 提取 CardThumb、导入导出逻辑到独立组件 |
| REQ-WEB-P2-03 | 界面设计审计 | 编辑器响应式适配 | 至少支持 1280px / 1440px / 1920px 断点，面板可折叠 |
| REQ-WEB-P2-04 | 界面设计审计 | 统一加载状态（骨架屏） | 主要列表页使用 Skeleton，替换纯文本“加载中...” |
| REQ-WEB-P2-05 | 界面设计审计 | 统一空状态与按钮样式 | 所有列表空状态使用统一 Empty 组件；主按钮风格一致 |
| REQ-WEB-P2-06 | 交互体验审计 | 添加自动保存 | 编辑器每 30s / 关键操作后自动保存草稿到 localStorage/server |
| REQ-WEB-P2-07 | 交互体验审计 | 添加拖拽上传 | `FileUploader` / `PhotoUpload` 支持拖拽 |
| REQ-WEB-P2-08 | 可访问性审计 | 对话框焦点陷阱 | `ConfirmDialog`、`TextInputDialog` 等焦点不逃逸 |
| REQ-SRV-P2-01 | SEC-H4 | API 速率限制 | 上传/渲染提交端点按 IP/user 限流 |
| REQ-SRV-P2-02 | SEC-H2 | 路径遍历加固 | `digital-humans.ts:211` 等处严格校验并 sanitize 路径 |
| REQ-SRV-P2-03 | SEC-H5 | API 密钥不落库 | `render_jobs` 不持久化完整 provider_config |
| REQ-WRK-P2-01 | P2 列表 | 断点续传机制 | Stage 1-2 产物可复用，失败后从最近成功 stage 恢复 |
| REQ-WRK-P2-02 | W-M2 | 合并重复路径解析函数 | 统一 `/uploads/` → 本地路径工具 |
| REQ-TST-P2-01 | P2 列表 | 前端单元测试 | 为关键 hooks/components 添加 Vitest 测试 |
| REQ-TST-P2-02 | P2 列表 | CI 覆盖率报告 | 收集并上报 server/shared/worker 测试覆盖率 |

---

## 复核记录

| 审计项 | 复核方式 | 复核结果 |
|---|---|---|
| S-C1 全局错误处理 | 直接读取 `app.ts` | 确认缺失 |
| W-C1 pipeline.py 死代码 | 直接读取 `pipeline.py` | 确认 `run_pipeline` 独立存在 |
| W-H1 FFmpeg drawtext 注入 | 直接读取 `stage3_video_gen.py:950-995` | 确认 `text` 未转义 |
| W-H2 运算符优先级 | 直接读取 `stage4_ffmpeg.py:338` | 确认 `and/or` 缺括号 |
| F-C1 TS strict | 直接读取 `tsconfig.app.json` | 确认未启用 |
| S-H1 `as any` 数量 | `grep` 统计 server 源文件 | 74 处 |
| F-H3 裸 fetch 数量 | `grep` 统计 web 源文件 | 85 处（tsx 80 + ts 5） |
| SH-C1 类型重复 | 直接读取 `editor.ts` / `template.ts` | 确认 `SegmentType/AspectRatio/SubtitlePosition/EditorObjectType/Segment/EditorObject` 重复且字段不一致 |
| W-H4 print 日志 | `grep` 统计 worker 源文件 | 100+ 处 |

---

## MCP 复核与 Impact 分析

GitNexus 索引重建成功后（6,628 nodes | 14,343 edges | 355 clusters | 300 flows），使用 MCP `impact` / `context` / `route_map` / `explain` 对关键符号进行复核与影响面分析。

### 关键符号 Impact 汇总

| 目标符号 | 文件 | 上游影响数 | 风险 | 分析结论 |
|---|---|---|---|---|
| `createApp` | `guide/server/src/app.ts:29` | 1 | LOW | 仅 `index.ts` 调用；添加全局错误处理中间件风险极低，但所有路由异常都会经过它，需确保不吞掉 `apiError()` 已处理的响应。 |
| `run_pipeline` | `guide/worker/worker/pipeline.py:41` | 0 | LOW | **确认死代码**，无上游调用；可直接删除或移入 `archive/`。 |
| `_generate_placeholder_clip` | `guide/worker/worker/stage3_video_gen.py:957` | 5 | LOW | 被 `_generate_clip_for_segment` 调用，最终进入 `run_pipeline` 执行流；修复 drawtext 转义需同步检查 fallback 路径（`cmd_without_text`）。 |
| `_resolve_overlay_asset` | `guide/worker/worker/stage4_ffmpeg.py:263` | 5 | LOW | 被 `assemble_final_video` 调用，影响 Lottie/WebM/PNG 序列判定；修复运算符优先级时需保留现有测试覆盖。 |
| `_JOB_CONFIG_SNAPSHOT` | `guide/worker/worker/config.py:24` | 0（图未捕获访问边） | LOW | 实际由 `set_job_config_snapshot` 写入、`_load_json` 读取；`set_job_config_snapshot` 仅有 `run_worker.py:process_job` 一个调用点。改为参数透传时影响面集中在 `process_job` → 各 `get_*_config()`。 |
| `set_job_config_snapshot` | `guide/worker/worker/config.py:38` | 2 | LOW | 仅 `run_worker.py:process_job` 调用。 |
| `process_job` | `guide/worker/run_worker.py` | 2 | LOW | worker 主入口；改造全局状态时必须保持单 job 串行语义。 |
| `assemble_final_video` | `guide/worker/worker/stage4_ffmpeg.py` | 6 | LOW | Stage4 核心函数；`_resolve_overlay_asset`、BGM 混音、字幕生成等改动均汇聚于此。 |
| `Segment` (template.ts) | `guide/shared/types/template.ts:76` | 3 | LOW | 引用面很小，可作为合并后的基准类型。 |
| `Segment` (editor.ts) | `guide/shared/types/editor.ts:10` | **61** | **HIGH** | 23 个直接导入/引用，覆盖 editor store、EditorPage、所有 panel components、server routes；**类型统一是高风险改动，必须分阶段进行**。 |
| `apiError` | `guide/server/src/apiErrors.ts` | 13 | MEDIUM | 13 处调用；全局错误处理中间件可直接复用，但需避免 double-json。 |
| `cors_origins` | `api/config.py:31` | 0 | LOW | 默认值 `["*"]`；修改默认配置影响 FastAPI 网关，Express CORS 当前为 `cors()` 无选项，需同步配置。 |
| `EditorPage` | `guide/web/src/pages/EditorPage.tsx:74` | 0 | LOW | 路由级页面组件，拆分/重构不影响上游调用，但内部 1121 行需渐进拆分。 |
| `DigitalHumanDetailPage` | `guide/web/src/pages/DigitalHumanDetailPage.tsx` | 0 | LOW | 路由级页面；轮询间隔调整孤立。 |
| `AssetHubPage` | `guide/web/src/pages/AssetHubPage.tsx` | 0 | LOW | 路由级页面；拆分孤立。 |

### API 路由复核

使用 `gitnexus_route_map` 扫描到 117 条路由。关键发现：

1. **所有路由 middleware 为空** — 与审计结论一致：零认证、零速率限制、零请求日志。
2. **静态资源路由** `/uploads`、`/renders`、`/brand-fonts` 直接由 `app.ts` 提供，无认证；这与 SEC-C1、SEC-H2 路径遍历风险直接相关。
3. **消费端映射**：
   - `/api/uploads` 被 4 个前端组件消费（`FileUploader`、`DigitalHumanDetailPage`、`MediaLogoPickerModal`、`AssetHubPage`）— 统一上传客户端收益大。
   - `/api/library` 被 5 个消费方使用 — 是统一 API 客户端的重点。
   - `/api/error-catalog` 被 `RenderResultPage` 和 `IntegratorPlayground` 消费 — 全局错误处理需保持该端点正常。

### 安全 Taint 分析

`gitnexus_explain` 当前返回 `no taint layer`。如需进行源代码→sink 的注入分析（如 `drawtext` 文本、上传文件名、CLI 参数），需先运行：

```bash
npx gitnexus@1.6.8 analyze --pdg
```

**建议**：在修复 REQ-WRK-P0-01（drawtext 注入）、REQ-SRV-P1-02（请求体验证）、REQ-SRV-P2-02（路径遍历加固）之前，先启用 PDG 层进行 taint 复核。

### 基于 Impact 的落地顺序调整

1. **可立即低风险执行**：
   - REQ-SRV-P0-01（全局错误处理）：`createApp` 影响面仅 1，不会破坏现有路由。
   - REQ-SRV-P0-03（CORS）：`cors_origins` 影响面 0，纯配置变更。
   - REQ-WRK-P0-02（删除 `run_pipeline`）：已确认死代码，0 上游影响。
   - REQ-WRK-P0-03（运算符优先级）：`_resolve_overlay_asset` 影响 5，但已有测试覆盖，风险可控。

2. **需要小心测试覆盖**：
   - REQ-WRK-P0-01（drawtext 注入）：影响 `run_pipeline` 执行流，需补充恶意输入单测。
   - REQ-WRK-P0-04（print → logger）：改动文件多，需确保日志格式与现有日志收集兼容。

3. **高风险，需分阶段**：
   - REQ-SHR-P1-01（统一 `Segment` 类型）：`editor.ts:Segment` 61 处引用，**必须先建立兼容层**，禁止一次性删除旧类型。
   - REQ-WEB-P0-01（TS strict）：会暴露大量 implicit any，建议按目录逐步开启 `strictNullChecks` → `noImplicitAny` → full strict。

4. **前置依赖**：
   - REQ-SRV-P0-02（认证层）是 REQ-SRV-P1-02（请求体验证）和多数安全改进的前提。
   - REQ-SHR-P1-01 是 REQ-SRV-P1-03（消除 `as any`）和 REQ-WEB-P0-01 的前置。

## 下一步建议

1. **P0 优先落地**：按 `安全 > 稳定性 > 类型安全` 顺序执行，先完成 REQ-SRV-P0-02（认证）、REQ-SRV-P0-01（错误处理）、REQ-SRV-P0-03（CORS）、REQ-WRK-P0-01（drawtext 注入）。
2. **P1 并行推进**：REQ-SHR-P1-01（统一类型）是 REQ-SRV-P1-03 和 REQ-WEB-P0-01 的前置条件，建议先做。
3. **每次改动后**：运行 `make test-guide-shared && make test-guide-server && make test-guide-fast && make test-guide`，确保无回归。
4. **提交规范**：使用 Conventional Commits，例如 `feat(auth): add API token middleware`、`fix(worker): escape FFmpeg drawtext text`。
