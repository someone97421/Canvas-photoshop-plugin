# Agent 指南

本仓库是基于 SD-PPP 2.0 的自用 fork。沟通、变更说明和 commit message 使用中文；不向上游提交 PR。

## 改造目标

- 把本插件改造成 `I:\Coding项目\XuanshangCanvas-GO` 的配套 Photoshop 插件：连接画布后端、调用画布生成任务并把结果送回 Photoshop。
- 必须保留现有 ComfyUI 与 RunningHub 能力；新增画布原生支持时使用独立适配层，不要把现有 Socket.IO 协议直接改造成画布协议。
- 以当前 2.0 源码为基底，不为旧版 1.x 架构新增兼容代码，除非现有 Legacy ComfyUI 节点确实依赖它。
- 画布契约以本机 `I:\Coding项目\XuanshangCanvas-GO` 的可执行源码为准，不以远端 README、历史文档或猜测为准。涉及接口时先读该仓库的 `AGENTS.md`、`apps/server/src/index.ts`、对应 `routes/` 和 `packages/shared/src/index.ts`。

## 真实边界

- `typescripts/modules/photoshop/src/entry.tsx` 是公开 Photoshop React 入口；它只暴露 `globalThis.sdppp.renderPhotoshopPlugin`，真正的 UXP 宿主壳不在本仓库。
- Photoshop 构建依赖被忽略的 `typescripts/modules/photoshop-internal` 和全局 `window.SDPPPInternal`；`plugins/photoshop/` 也没有 manifest。不要声称仅凭公开源码可重建完整 CCX。
- `typescripts/modules/comfy/src/comfy-entry.mts` 是 ComfyUI Web 扩展入口；`__init__.py` 是 ComfyUI Python 包入口；`sdppp_python/sdppp.py` 挂载 `/sd-ppp/` Socket.IO 服务。
- `typescripts/src/` 是 Photoshop 与 ComfyUI 的共享协议、Store 和工作流代码。现有 `F_photoshop`/`B_photoshop`、`F_workflow`/`B_workflow` 事件属于 SD-PPP 协议，不是 XuanshangCanvas 协议。
- `javascript/`、`plugins/photoshop/dist/` 和 `static/*.ccx` 是构建/发行产物；常规源码改动不要手工编辑这些文件。

## XuanshangCanvas 集成

- 画布后端是 Fastify/TypeScript，不是 Go 服务；开发默认监听 `127.0.0.1:48051`，健康检查为 `GET /api/system/status`，实时端点为原生 WebSocket `/ws`。
- 画布任务不是任意 prompt 提交：任务由已有项目图中的节点创建。当前入口是 `POST /api/projects/:projectId/tasks`，body 为 `{ "nodeId": string }`；通过 `GET /api/projects/:projectId/tasks/:taskId` 轮询。
- 任务终态为 `succeeded | failed | canceled`；成功结果从 `Task.result.outputAssetIds`、`outputPaths` 和 `primaryOutputAssetId` 读取。契约定义在画布仓库 `packages/shared/src/index.ts`，接入前必须重新核对。
- 获取结果优先使用后端 HTTP 资源/API，不要在插件中直接读取画布数据目录。项目、图、资产与上传路由位于画布仓库 `apps/server/src/routes/projects.ts`。
- `/ws` 的项目订阅消息为 `{ "type": "subscribe", "projectId", "sessionId" }`。携带 `sessionId` 会参与“单活动编辑会话”仲裁；插件只监听任务时不要冒充画布编辑标签页，除非已明确设计会话语义。
- Photoshop UXP 来源不在画布后端现有 CORS 白名单中；真实联调前同时核对 UXP 网络权限、画布 CORS/认证和 launcher 动态端口。不要将 `48051` 当成生产固定端口硬编码到业务逻辑。
- 画布品牌会限制 Provider 和节点；原生适配不得绕过后端品牌校验、Provider 配置或任务运行器。RunningHub 兼容既可能来自现有 SD-PPP 路径，也可能来自画布 Provider，UI 和配置中要明确区分。

## 命令与验证

- Node 版本由 `.nvmrc` 固定为 `v23.11.0`；包管理器使用 pnpm。
- 每次准备创建并推送一个新提交时，先读取 `package.json` 当前版本，将补丁号递增 1，并把同一版本同步写入 `package.json` 与 `pyproject.toml`；同一次提交交付只递增一次，提交完成后仅推送已有提交时不得再次递增。
- 版本更新后、提交或推送前运行 `pnpm build`，生成一般分发包 `sd-ppp_all.zip`；构建失败时不得继续提交或推送。该 ZIP 保持 Git 忽略，不纳入提交。
- `sdppp_python/version.txt` 与 `sdppp_python/version2.txt` 是协议/API 级别，不是发布版本，禁止随发布版本自动修改。
- 开发构建使用 `pnpm dev`，即 esbuild watch，并会额外监听 `localhost:8787` 发送构建通知。它是长驻进程，只能在用户可见、关闭后可终止整棵进程树的终端中启动。
- `pnpm tscheck` 是 TypeScript 静态检查。当前 pnpm 可能先因 `ERR_PNPM_IGNORED_BUILDS` 阻止 esbuild 安装脚本；不要把该环境错误误报为 TypeScript 错误，也不要未经确认运行交互式 `pnpm approve-builds`。
- `pnpm build` 会编译源码、覆盖 `plugins/photoshop/dist`、重打 `static/sd-ppp_PS.ccx` 并生成 `sd-ppp_all.zip`；只在明确需要发行产物时运行。它依赖 Bash/zip，并受缺失内部 Photoshop 模块影响。
- 测试位于 `typescripts/test/mocha/`，通过 `SDPPPTestResolvePlugin` 注入开发 bundle 后在宿主中运行；生产构建会移除测试模块。仓库目前没有可靠的根级单测 CLI，优先对改动执行 `pnpm tscheck`，再做对应 Photoshop/ComfyUI/画布联调。
- Python 侧没有自动化测试入口；只改 Python 时至少做相关模块语法/导入检查，但不要脱离 ComfyUI 假定 `__init__.py` 可直接导入，它依赖 `custom_nodes` 路径和 ComfyUI 的 `server`/`nodes` 模块。

## 易踩坑

- `__init__.py` 导入时会尝试安装缺失的 `python-socketio` 和 `jsonpatch`；验证导入可能改动当前 Python 环境。
- `sdppp_python/comfy/nodes.py` 的跨线程调用存在忙等，`SDPPP.has_ps_instance()` 当前也始终返回 `True`。触及连接或任务调度时先处理/规避这些既有行为，不要据此推断连接真实可用。
- 不要依据 `.cursor/rules/` 认定项目使用 Vite、Vitest、ESLint 或 Prettier；这些文件是通用模板，当前仓库实际使用 esbuild 和宿主内 Mocha。
- 用户未明确要求时，不创建分支、不提交、不推送；用户要求提交时使用中文 commit message，并排除 CCX、zip、dist 等非本次明确要求的生成物。
