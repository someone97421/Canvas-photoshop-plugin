# Agent 指南

本仓库是基于 SD-PPP 2.0 的自用 fork。沟通、变更说明和 commit message 使用中文；不向上游提交 PR。

## 改造目标

- 把本插件改造成 `E:\CodingProject\XuanshangCanvasV2轻量重构` 的配套 Photoshop 插件：连接画布后端、调用画布生成任务并把结果送回 Photoshop。
- 必须保留现有 ComfyUI 与 RunningHub 能力；新增画布原生支持时使用独立适配层，不要把现有 Socket.IO 协议直接改造成画布协议。
- 以当前 2.0 源码为基底，不为旧版 1.x 架构新增兼容代码，除非现有 Legacy ComfyUI 节点确实依赖它。
- 画布契约以本机 `E:\CodingProject\XuanshangCanvasV2轻量重构` 的可执行源码为准，不以远端 README、历史文档或猜测为准。涉及接口时先读该仓库的 `AGENTS.md`、`apps/server/src/index.ts`、对应 `routes/` 和 `packages/shared/src/index.ts`。

## 真实边界

- SD-PPP 2.0 完整前端与 Photoshop UXP 宿主源码来自 `https://github.com/sd-ppp/monorepo`。当前导入基线为其 `master` 分支；该仓库 README 明确标注为“SD-PPP 2.0 前端代码仓库”。需要核对上游实现时以该仓库源码为准，不再逆向 `static/sd-ppp2_PS.ccx`。
- 上游 Monorepo 通过 `release-repos/sd-ppp` 子模块引用 `https://github.com/zombieyang/sd-ppp`；当前仓库本身就是该发布仓库的 fork，因此合并时不保留嵌套子模块，Monorepo 构建与打包路径直接指向当前仓库根目录的 Python、ComfyUI 和 `static/`。
- `packages/sdppp-photoshop/` 是真实 2.0 Photoshop 前端与完整 UXP 插件壳；`packages/sdppp-photoshop/src/index.tsx` 是 Webview React 入口，`packages/sdppp-photoshop/plugin/manifest.json`、`run.js`、`sdppp/photoshop.html` 是宿主入口。
- `packages/ps-common/sdk/sdppp-ps-sdk.js` 与 `.d.ts` 定义 Webview 到 UXP 宿主的真实 SDK；Photoshop Store、ComfyCaller、`photoshop.getImage`、`getMask`、`importImage`、文件资源和代理请求都通过 `sdpppSDK` 使用，不新增平行的 Socket/Callee 或 PhotoshopBridge 替代层。
- `capabilities/resourcing/src/ps-adapter/` 是 Photoshop 原生能力实现；图像、选区、边界、图层和 Modal 状态处理应在该适配层修改。`packages/sdppp-photoshop/src/providers/` 是 Provider 体系，现有 ComfyUI、RunningHub、OpenAI/Gemini 通用接口与 Replicate 必须保留。
- `typescripts/modules/comfy/src/comfy-entry.mts` 是 ComfyUI Web 扩展入口；`__init__.py` 是 ComfyUI Python 包入口；`sdppp_python/sdppp.py` 挂载 `/sd-ppp/` Socket.IO 服务。
- `typescripts/src/` 是 Photoshop 与 ComfyUI 的共享协议、Store 和工作流代码。现有 `F_photoshop`/`B_photoshop`、`F_workflow`/`B_workflow` 事件属于 SD-PPP 协议，不是 XuanshangCanvas 协议。
- `typescripts/modules/photoshop/` 与 `plugins/photoshop/` 是合并前公开发布仓库遗留的简化 Photoshop 前端，不再作为 2.0 UXP 主入口；Canvas 代码迁移完成后不得继续向该目录增加宿主能力。
- `javascript/`、`packages/sdppp-photoshop/plugin/webview/` 和 `static/*.ccx` 是构建/发行产物；常规源码改动不要手工编辑这些文件。

## 2.0 源码索引

- `packages/sdppp-photoshop/src/tsx/App.tsx`：Photoshop Webview 主应用与 Provider 网关入口。
- `packages/sdppp-photoshop/src/tsx/gateway/sdppp.tsx`：Provider 选择与主界面路由。
- `packages/sdppp-photoshop/src/providers/`：Provider 注册及 ComfyUI、RunningHub、Custom API、Replicate 实现；Canvas 原生支持放在独立 `_canvas/` 目录并注册到同一体系。
- `packages/sdppp-photoshop/src/tsx/App.store.ts`：预览结果、资源句柄与发送回 Photoshop 的前端状态。
- `packages/sdppp-photoshop/plugin/`：完整 UXP manifest、宿主脚本、SDK 容器和 Webview 发行目录。
- `packages/ps-common/`：共享 SDK、Store 类型、国际化与 schema；`sdk/sdppp-ps-sdk.d.ts` 是 Webview 可调用能力的权威索引。
- `capabilities/resourcing/src/ps-adapter/`：Photoshop DOM/Imaging 实现，包括 `tools/get-image.ts`、`tools/get-selection.ts`、`tools/get-document-info.ts`、`tools/get-layer-info.ts` 与 Modal 状态恢复。
- `capabilities/resourcing/src/@sideweb/`：Webview 侧资源动作与句柄；Provider 不直接操作 UXP 文件系统或 Photoshop DOM。
- `packages/sdppp-photoshop-widgets/`：Photoshop 图片、遮罩、边界控件与上传交互。
- `packages/widgetable-ui/`：动态工作流控件渲染框架。
- `packages/cbm-calculator/`：内容、边界、遮罩几何计算。
- `build/build.js`：Monorepo 构建编排；`build/package-psccx.js`：从完整 `packages/sdppp-photoshop/plugin/` 打包 `static/sd-ppp2_PS.ccx`。
- 根目录 `typescripts/`、`sdppp_python/`、`javascript/`：发布仓库中的 ComfyUI 扩展、共享旧协议和 Python 后端，仍由一般分发包收录。

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
- 版本更新后、提交或推送前运行 `pnpm build`，生成一般分发包 `sd-ppp_all.zip`；构建失败时不得继续提交或推送。该 ZIP 保持 Git 忽略，不纳入提交。构建前必须确认完整 UXP 宿主壳存在，且生成的 CCX 根目录包含 `manifest.json`；否则该包只是公开 React bundle，禁止作为 Photoshop 分发版交付。
- `sdppp_python/version.txt` 与 `sdppp_python/version2.txt` 是协议/API 级别，不是发布版本，禁止随发布版本自动修改。
- 开发构建使用 `pnpm dev`，按 Monorepo 包脚本并行启动；当前真实 2.0 Photoshop Webview 使用 Vite。它是长驻进程，只能在用户可见、关闭后可终止整棵进程树的终端中启动。
- `pnpm tscheck` 是 TypeScript 静态检查。当前 pnpm 可能先因 `ERR_PNPM_IGNORED_BUILDS` 阻止 esbuild 安装脚本；不要把该环境错误误报为 TypeScript 错误，也不要未经确认运行交互式 `pnpm approve-builds`。
- `pnpm build` 会构建 Monorepo 基础包、真实 2.0 Photoshop Webview、完整 UXP 宿主和 ComfyUI 前端，并重打 `static/sd-ppp2_PS.ccx` 后生成 `sd-ppp_all.zip`；只在明确需要发行产物时运行。构建后必须检查 CCX 根目录存在 `manifest.json`，且一般分发包包含该 CCX。
- 测试位于 `typescripts/test/mocha/`，通过 `SDPPPTestResolvePlugin` 注入开发 bundle 后在宿主中运行；生产构建会移除测试模块。仓库目前没有可靠的根级单测 CLI，优先对改动执行 `pnpm tscheck`，再做对应 Photoshop/ComfyUI/画布联调。
- Python 侧没有自动化测试入口；只改 Python 时至少做相关模块语法/导入检查，但不要脱离 ComfyUI 假定 `__init__.py` 可直接导入，它依赖 `custom_nodes` 路径和 ComfyUI 的 `server`/`nodes` 模块。

## 易踩坑

- `__init__.py` 导入时会尝试安装缺失的 `python-socketio` 和 `jsonpatch`；验证导入可能改动当前 Python 环境。
- `sdppp_python/comfy/nodes.py` 的跨线程调用存在忙等，`SDPPP.has_ps_instance()` 当前也始终返回 `True`。触及连接或任务调度时先处理/规避这些既有行为，不要据此推断连接真实可用。
- 真实 2.0 Photoshop 前端使用 Vite 和 Vitest；发布仓库遗留的 `typescripts/` 仍使用 esbuild 与宿主内 Mocha。运行命令和判断测试入口时按所在模块区分。
- 用户未明确要求时，不创建分支、不提交、不推送；用户要求提交时使用中文 commit message，并排除 CCX、zip、dist 等非本次明确要求的生成物。
