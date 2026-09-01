# Canvas Photoshop Plugin

基于 SD-PPP 2.0 的自用 Photoshop 插件 fork，用于连接 XuanshangCanvas 后端，同时保留 ComfyUI 与 RunningHub 兼容能力。

## 当前结构

- Photoshop Webview 入口：`packages/sdppp-photoshop/src/index.tsx`
- Photoshop UXP 宿主入口：`packages/sdppp-photoshop/plugin/`
- ComfyUI Web 扩展入口：`typescripts/modules/comfy/src/comfy-entry.mts`
- ComfyUI Python 入口：`__init__.py`
- 共享协议与状态：`typescripts/src/`

完整开发边界、构建限制和 XuanshangCanvas 接入约定见 `AGENTS.md`。

## 开发命令

```bash
pnpm tscheck
pnpm dev
```

`pnpm build` 会重建 Photoshop Webview、完整 UXP 插件包、ComfyUI Web 扩展和一般分发包。

Photoshop 安装包为 `static/sd-ppp2_PS.ccx`（也保留同内容的 `static/sd-ppp2_PS.zip` 便于调试），内含 XuanshangCanvas、ComfyUI、RunningHub、OpenAI/Gemini 通用接口与 Replicate Provider。

## License

BSD 3-Clause。保留原项目版权声明，详见 `LICENSE` 与 `NOTICE`。
