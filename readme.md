# Canvas Photoshop Plugin

基于 SD-PPP 2.0 的自用 Photoshop 插件 fork，用于连接 XuanshangCanvas 后端，同时保留 ComfyUI 与 RunningHub 兼容能力。

## 当前结构

- Photoshop React 入口：`typescripts/modules/photoshop/src/entry.tsx`
- ComfyUI Web 扩展入口：`typescripts/modules/comfy/src/comfy-entry.mts`
- ComfyUI Python 入口：`__init__.py`
- 共享协议与状态：`typescripts/src/`

完整开发边界、构建限制和 XuanshangCanvas 接入约定见 `AGENTS.md`。

## 开发命令

```bash
pnpm tscheck
pnpm dev
```

`pnpm build` 会重建 Canvas 原生 Photoshop 插件和一般分发包。SD-PPP 2.0 兼容插件依赖未公开的内部宿主模块，因此以预编译 CCX 保留。

一般分发包中包含两个 Photoshop 插件：

- `static/sd-ppp_PS.ccx`：XuanshangCanvas 原生面板，用于提交画布生图任务并把结果送回 Photoshop。
- `static/sd-ppp2_PS.ccx`：SD-PPP 2.0 兼容插件，保留 ComfyUI、RunningHub、OpenAI 通用格式与 Gemini 通用接口。它与 Canvas 原生面板使用不同插件 ID，可同时安装。

## License

BSD 3-Clause。保留原项目版权声明，详见 `LICENSE` 与 `NOTICE`。
