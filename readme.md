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

`pnpm build` 会覆盖发行产物，且完整 Photoshop 构建依赖未公开的内部宿主模块；仅在明确需要发行包时运行。

## License

BSD 3-Clause。保留原项目版权声明，详见 `LICENSE` 与 `NOTICE`。
