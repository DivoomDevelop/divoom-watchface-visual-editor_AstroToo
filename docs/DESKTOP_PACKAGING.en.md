# Desktop packaging and installation

## Languages

The Windows and macOS installers each contain one multilingual app. There are no separate Chinese and English DMGs. On first launch, the editor selects its interface language from the system language when supported. Users can change the language in the editor; that choice is saved for subsequent launches. The installer or macOS Finder interface may use a different language from the editor.

## Windows

The x64 NSIS setup file is named `AstroToo-Watchface-Editor-<version>-win-x64-setup.exe`. The wizard offers installation for the current user or all users and allows a custom destination. Electron and the app assets are included. Users do not need Node.js, Python, Vite, or a separate browser.

Build on Windows:

```sh
npm ci
npm run desktop:make:win
```

## macOS

Use the `arm64` DMG for Apple Silicon Macs and the `x64` DMG for Intel Macs. Open the DMG and drag **AstroToo Watchface Editor** into **Applications**. The DMG is named `AstroToo-Watchface-Editor-<version>-mac-<arch>.dmg`.

Build on macOS:

```sh
npm ci
npm run desktop:make:mac -- --arm64
# Or, for an Intel build:
npm run desktop:make:mac -- --x64
```

The regular macOS release workflow requires an Apple Developer ID certificate and notarization credentials. The test workflow builds an ad-hoc signed DMG and verifies its disk image and app signature. Ad-hoc signing does **not** satisfy Gatekeeper for downloaded apps, so a test Mac may block launch. For a trusted test copy only, move the app to Applications, then remove quarantine from that app alone:

```sh
xattr -dr com.apple.quarantine "/Applications/AstroToo Watchface Editor.app"
open "/Applications/AstroToo Watchface Editor.app"
```

Do not disable Gatekeeper system-wide. For normal distribution without this test step, sign with Apple Developer ID and notarize the app.

Both platforms put generated installers in `out-desktop/` locally. CI uploads installers as GitHub Actions artifacts; generated binaries are excluded from Git source history.
