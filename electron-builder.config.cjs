module.exports = {
  appId: "com.divoom.astrotoo.watchfaceeditor",
  productName: "AstroToo Watchface Editor",
  asar: true,
  electronDist: process.platform === "win32" ? "node_modules/electron/dist" : undefined,
  directories: { output: "out-desktop" },
  files: ["package.json", "desktop/**/*", "dist/**/*", "!dist/start-local-preview.cmd"],
  win: {
    target: "nsis",
    artifactName: "AstroToo-Watchface-Editor-${version}-win-${arch}-setup.${ext}"
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false
  },
  mac: {
    target: "dmg",
    category: "public.app-category.graphics-design",
    hardenedRuntime: true,
    notarize: true,
    artifactName: "AstroToo-Watchface-Editor-${version}-mac-${arch}.${ext}"
  }
};
