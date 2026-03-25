# macOS Packaging

This repo ships as an Electron desktop app. The macOS release flow uses Electron Forge to produce a packaged `.app`, a `.zip`, and a `.dmg`.

## Commands

- `npm run package:mac` builds a packaged `.app` bundle for macOS.
- `npm run make:mac` creates the distributable macOS artifacts, including the DMG maker output.

## Signing And Notarization

macOS packaging always provides `osxSign: {}` so Forge follows the standard codesigning path for mac builds. Notarization remains environment-driven and only activates when one full credential set is present.

The Forge config supports three notarization credential paths, in this precedence order:

1. `APPLE_KEYCHAIN_PROFILE` with optional `APPLE_KEYCHAIN`
2. `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`
3. `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`

`APPLE_KEYCHAIN` is optional and is passed through for the keychain-profile flow and codesign keychain lookup. If an App Store Connect or Apple ID credential group is only partially configured, the Forge config fails fast with a targeted error.

## Notes

- The DMG maker uses an APFS-backed staging image for compatibility with current macOS `hdiutil` behavior in this toolchain.
- The committed release icons live at `assets/icons/dune.png` and `assets/icons/dune.icns`. Replace those files with final brand artwork when needed.
- The bundle identifier is `com.dorianzheng.dune`.
