# Desktop packages and compatibility

Tawdheef keeps its browser interface and local Node/SQLite service. A user package includes the prebuilt interface, server dependencies, Node 26.13.1 LTS and npm for explicitly selected optional integrations. It does not include Vite, React development packages, tests, marketing assets, downloadable directory packs or mailbox/browser bridges. The source edition remains available for contributors and supports patched Node 24 and Node 26.

## Build and verify

Run on the target operating system and architecture:

```sh
npm ci
npm test
npm run build
npm run release:check
npm run release:app -- --output outputs/NEW-DESKTOP-CANDIDATE
npm run release:app:smoke -- --directory outputs/NEW-DESKTOP-CANDIDATE --output outputs/NEW-DESKTOP-CANDIDATE/smoke-verification.json
```

The output must be a new folder. Packaging downloads the official Node archive over HTTPS and compares SHA-256 with the official release checksum before extraction. Third-party runtime/npm licences remain in `runtime/`; application dependency licences remain in their packages. `package-report.json` records the exact target, runtime archive/hash, app archive/hash, file count and installed size. Packaging does not publish anything or establish that checks passed.

The exact-ZIP smoke test restores executable permissions, uses a path with spaces and Arabic characters, invokes the actual `.cmd`, `.command` or `.sh` launcher, opens the app using bundled Node, verifies a repeated launch reuses its process, configures both clients in that temporary project, and performs real stdio MCP discovery and a context read. It stops its test server. It never signs into accounts, calls an AI model or sends applications/emails. It does not prove an actual assistant account or OS signature is working.

`.github/workflows/desktop-packages.yml` defines target-specific build/smoke jobs for Windows x64/ARM64, macOS Intel/Apple Silicon and Linux x64/ARM64. CI also defines backend coverage for Node 24/26 on Windows/macOS/Linux and browser checks on all three OSs. A configured job is not a passing job: retain the run's uploaded package and smoke receipt before marking that target verified. Hosted runner availability and account policies remain external prerequisites.

## First launch and optional tools

Extract the complete folder. Windows uses **Start Tawdheef.cmd**; Mac uses **Start Tawdheef.command**; Linux uses **start-tawdheef.sh**. These prefer bundled Node and forward a controlled `--no-open` option for verification. The initial working app needs no npm install, build or account. Connected services still need internet, personal sign-in and consent.

Use Connections to choose Codex or Claude Code and copy the setup request. Each assistant still requires its own installation and account; these clients are not bundled. Discovery checks native, Homebrew, Volta, nvm and npm installations. If needed, explicitly set `TAWDHEEF_CODEX_PATH` or `TAWDHEEF_CLAUDE_PATH` to an absolute native executable or supported JS entrypoint; shell wrappers and relative overrides are rejected. The default browser-only chat products do not automatically read local MCP settings.

With no system Node/npm, use the bundled runtime directly. Examples on Windows:

```powershell
.\runtime\node.exe scripts/setup.mjs --browser
.\runtime\node.exe scripts/agent-setup.mjs codex --browser --check
.\runtime\node.exe scripts/agent-setup.mjs codex --browser
```

On Mac/Linux, replace `.\runtime\node.exe` with `./runtime/bin/node`. Browser tools install only when `--browser` is selected; use `--integration google-cli` or `--integration outlook-mcp` for one bridge. `--all` explicitly requests all supported integrations. Google Workspace CLI is currently unavailable on Windows ARM64; native mail providers and other integrations remain usable. npm lifecycle processes receive the bundled Node directory in PATH, without changing system settings.

Only explicit agent setup changes project configuration. It preserves unrelated settings, previews with `--check`, backs up managed upgrades in `.tawdheef-setup/backups/`, and refuses edited/unowned conflicting entries. The ownership merger does not validate arbitrary unrelated TOML. Keep `.tawdheef-setup/` private and excluded from releases, just like `.local/`.

## Updates and login startup

Private data stays in `.local/`, or the existing `APPLY_TRACKER_DATA` folder. Stop Tawdheef and its MCP processes before backing up. Extract an update separately, keep the existing data path/port, then verify the new installation before removing the old one. Packages never overwrite an existing output or silently migrate personal data. Do not replace the only copy of your database.

Optional login startup is explicit: per-user Windows VBS, macOS LaunchAgent, Linux XDG autostart. It preserves foreign entries and does not enable schedules, sign in or start a run. Moving the app requires updating that entry through the explicit startup command. Rendering and fixture tests do not establish actual Finder/Gatekeeper or login execution on another OS.

## Signing and release status

Default packages are **unsigned local candidates**, not signed installers. Do not advise people to disable Smart App Control, Gatekeeper or other OS protections. Consumer publication requires Windows signature verification and a signed/notarized Mac distribution, plus native Explorer/Finder and login testing. That requires the maintainer's signing identities and platform access.

For a controlled release build, `TAWDHEEF_SIGN_SCRIPT` may name an absolute local JavaScript signing/notarization driver. It receives the staged app folder as its only argument and runs before the archive is created. The driver must use the platform's signing service and return failure on signing/notarization failure. Packaging records only that the driver completed; it never sets `signed:true` or claims OS verification from process completion. Keep signing credentials outside the repository. Preserve external signing/OS-verification receipts separately.

Public links continue to point at existing source releases until actual platform artifacts have been verified and published. No local build or fixture test proves successful live applications, mailbox access or employer responses.
