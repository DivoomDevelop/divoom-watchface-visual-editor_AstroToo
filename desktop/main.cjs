const path = require("node:path");
const { app, BrowserWindow, net, protocol } = require("electron");
const { APP_ORIGIN, handleAppRequest } = require("./routes.cjs");

protocol.registerSchemesAsPrivileged([
  { scheme: "astrotoo", privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "AstroToo Watchface Editor",
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 680,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.loadURL(`${APP_ORIGIN}/`);
}

if (hasInstanceLock) {
  app.setName("AstroToo Watchface Editor");
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    const bundleRoot = path.join(app.getAppPath(), "dist");
    const assetRoot = path.join(app.getPath("userData"), "downloaded-assets");
    protocol.handle("astrotoo", (request) => handleAppRequest(request, { bundleRoot, assetRoot, net }));
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
