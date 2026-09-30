Windows users can run `out-desktop/AstroToo-Watchface-Editor-*-win-x64-setup.exe` to install the desktop app. The setup wizard lets users install for the current user or all users and choose the installation folder. Node.js, Python, Vite, and a separate browser are not required. For source development, use `npm install` and `npm run dev` (see the root `README.md`). The macOS installer is produced by the macOS build job.

Static assets are in `public/font`, `public/template`, and `public/examples`. Source code is in `src/`, with `src/main.js` as the entry point and `src/editor/app.js` containing the editor logic.

## Watchface upload and review

After selecting a watchface and a LAN device in **My designs**, you can create or apply the device watchface configuration and upload the watchface. Before uploading, select a square app preview image no larger than 500×500 pixels; the editor converts it to WebP automatically. Public sharing requires a template category and administrator review. Updating an uploaded watchface requires an update note. The list on the left shows local, pending, published, and rejected states for the selected device's `DeviceId + ClockId`, without mixing in results from other devices.

For the full workflow, protocol details, and status meanings, see [Watchface upload and review](docs/WATCHFACE_SHARE.en.md) or the [Chinese guide](docs/WATCHFACE_SHARE.md). This feature requires device firmware with `SupportsClockShare`. The desktop app includes the required proxy; the web development preview needs the Vite proxy.

For a double-click browser launch without typing commands, see **Windows: one-click launch** in the root `README.md` (`Open-Editor.cmd` in the project root).
