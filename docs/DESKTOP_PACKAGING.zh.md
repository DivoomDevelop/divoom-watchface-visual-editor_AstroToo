# 桌面版打包与安装

## 语言

Windows 和 macOS 安装包均内置同一套多语言应用，不分别提供中文版和英文版 DMG。首次启动时，编辑器会根据系统语言选择受支持的界面语言；用户也可以在应用内手动切换，选择会在以后启动时保留。安装向导或 macOS Finder 的语言可能与编辑器不同。

## Windows

x64 的 NSIS 安装包名为 `AstroToo-Watchface-Editor-<version>-win-x64-setup.exe`。安装向导允许选择当前用户或所有用户，并可修改安装目录。安装包已包含 Electron 和应用资源，普通用户无需另装 Node.js、Python、Vite 或浏览器。

在 Windows 上构建：

```sh
npm ci
npm run desktop:make:win
```

## macOS

Apple 芯片 Mac 使用 `arm64` DMG，Intel Mac 使用 `x64` DMG。打开 DMG 后，将 **AstroToo Watchface Editor** 拖入 **应用程序（Applications）**。文件名格式为 `AstroToo-Watchface-Editor-<version>-mac-<arch>.dmg`。

在 macOS 上构建：

```sh
npm ci
npm run desktop:make:mac -- --arm64
# 构建 Intel 版本：
npm run desktop:make:mac -- --x64
```

正式 macOS 发布流程需要 Apple Developer ID 证书和公证凭据。测试流程生成临时签名的 DMG，并校验磁盘映像和应用签名。临时签名**不能**使下载的应用通过 Gatekeeper，因此测试 Mac 仍可能拦截启动。仅在确认文件来源可信的测试机器上，先把应用拖入“应用程序”，再只移除该应用的下载隔离标记：

```sh
xattr -dr com.apple.quarantine "/Applications/AstroToo Watchface Editor.app"
open "/Applications/AstroToo Watchface Editor.app"
```

不要关闭整个系统的 Gatekeeper。若需普通用户无需上述测试步骤即可打开，必须使用 Apple Developer ID 签名并完成公证。

两个平台的安装包在本机构建时输出到 `out-desktop/`。CI 会把安装包上传为 GitHub Actions 构建产物；生成的二进制文件不进入 Git 源码历史。
