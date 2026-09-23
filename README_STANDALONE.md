本仓库已改为 **Vite 工程**：请使用 `npm install` 与 `npm run dev` 启动（见根目录 `README.md`）。

静态资源位于 `public/font`、`public/template`、`public/examples`；源码在 `src/`（入口 `src/main.js`，编辑器逻辑在 `src/editor/app.js`）。

## 表盘上传与审核

在「我的设计」选择表盘和 LAN 设备后，可以创建/应用设备表盘配置，再上传线上表盘。上传前须选择宽、高都不超过 480 像素的 APP 预览图，工具会自动转为 WebP。公开分享须选择模板分类并等待管理员审核；更新线上表盘时须填写更新说明。左侧列表按当前设备的 `DeviceId + ClockId` 显示本地、待回复/待审核、已上线或审核未通过等状态，不会混用其他设备的结果。

完整操作、协议与状态说明见 [表盘上传与审核](docs/WATCHFACE_SHARE.md)；[English documentation](docs/WATCHFACE_SHARE.en.md)。此功能需要支持 `SupportsClockShare` 的真机固件，以及带代理功能的 Vite HTTP 预览。

**English (Windows users):** For a double-click launch without typing commands, see **“Windows: one-click launch (English)”** in the root **`README.md`** (script **`Open-Editor.cmd`** in the project root).
