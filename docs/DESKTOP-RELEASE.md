# Desktop packages and compatibility

Tawdheef keeps its browser interface and local Node/SQLite service. Windows adds a small native `Tawdheef.exe` launcher; macOS uses a proper `Tawdheef.app` bundle with a native launcher, icon and bundle metadata. These open the existing browser interface and add no embedded browser or UI framework. A user package includes the prebuilt interface, server dependencies, Node 26.13.1 LTS and npm for explicitly selected optional integrations. It does not include Vite, React development packages, tests, marketing assets, downloadable directory packs or mailbox/browser bridges. The source edition remains available for contributors and supports patched Node 24 and Node 26.

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

The exact-ZIP smoke test uses a path with spaces and Arabic characters, invokes the native Windows/Mac executable or Linux script, opens the app using bundled Node, verifies a repeated launch reuses its process, configures both clients in an external temporary workspace, and performs real stdio MCP discovery and a context read. It checks that private data and client configuration were not created inside the app. Signed downloads undergo platform signature verification before startup and again after setup. Mac extraction uses `ditto` to preserve notarization metadata. The test stops its server and never signs into accounts, calls an AI model or sends applications/emails. A direct native-executable smoke is distinct from a manual Finder/Explorer launch or an actual login-startup test.

`.github/workflows/desktop-packages.yml` defines target-specific build/smoke jobs for Windows x64/ARM64, macOS Intel/Apple Silicon and Linux x64/ARM64. CI also defines backend coverage for Node 24/26 on Windows/macOS/Linux and browser checks on all three OSs. A configured job is not a passing job: retain the run's uploaded package and smoke receipt before marking that target verified. Hosted runner availability and account policies remain external prerequisites.

The Mac browser matrix also checks core tracker flows in Playwright WebKit, the engine Safari uses. This is an engine check; manual Safari, Finder, OS quarantine and login-startup checks remain distinct.

## First launch and optional tools

Extract the complete folder. Windows uses **Tawdheef.exe**; Mac uses **Tawdheef.app**; Linux uses **start-tawdheef.sh**. Native launchers use bundled Node and accept only the controlled `--no-open` option for verification. The source edition retains `.cmd` and `.command` launchers. The initial working app needs no npm install, build or account. Connected services still need internet, personal sign-in and consent.

Use Connections to choose Codex or Claude Code and copy the setup request. Each assistant still requires its own installation and account; these clients are not bundled. Discovery checks native, Homebrew, Volta, nvm and npm installations. If needed, explicitly set `TAWDHEEF_CODEX_PATH` or `TAWDHEEF_CLAUDE_PATH` to an absolute native executable or supported JS entrypoint; shell wrappers and relative overrides are rejected. The default browser-only chat products do not automatically read local MCP settings.

With no system Node/npm, use the bundled runtime directly. Examples on Windows:

```powershell
.\runtime\node.exe scripts/setup.mjs --browser
.\runtime\node.exe scripts/agent-setup.mjs codex --browser --check
.\runtime\node.exe scripts/agent-setup.mjs codex --browser
```

On Linux, replace `.\runtime\node.exe` with `./runtime/bin/node`. In the Mac bundle, the app files and runtime are under `Tawdheef.app/Contents/Resources/app/`; use its `runtime/bin/node` with the corresponding absolute script path. Browser tools install only when `--browser` is selected; use `--integration google-cli` or `--integration outlook-mcp` for one bridge. `--all` explicitly requests all supported integrations. Google Workspace CLI is currently unavailable on Windows ARM64; native mail providers and other integrations remain usable. npm lifecycle processes receive the bundled Node directory in PATH, without changing system settings.

Only explicit agent setup changes project configuration. It preserves unrelated settings, previews with `--check`, backs up managed upgrades in `.tawdheef-setup/backups/`, and refuses edited/unowned conflicting entries. The ownership merger does not validate arbitrary unrelated TOML. Keep `.tawdheef-setup/` private and excluded from releases, just like `.local/`.

## Updates and login startup

Desktop packages preserve an explicit `APPLY_TRACKER_DATA` or an existing `.local` adjacent to the app. Fresh installations use `%LOCALAPPDATA%\Tawdheef` on Windows, `~/Library/Application Support/Tawdheef` on Mac, and `$XDG_DATA_HOME/tawdheef` or `~/.local/share/tawdheef` on Linux. Assistant configuration and owned guidance live in that data directory's `workspace/`, or explicit `TAWDHEEF_WORKSPACE`. Mac rejects data/workspace paths inside the signed `.app`. Source editions and existing portable data are not silently migrated. Stop Tawdheef and its MCP processes before backing up. Extract an update separately, keep the existing data path/port, then verify the new installation before removing the old one. Packages never overwrite an existing output. Do not replace the only copy of your database.

Optional login startup is explicit: per-user Windows VBS, macOS LaunchAgent, Linux XDG autostart. It preserves foreign entries and does not enable schedules, sign in or start a run. Moving the app requires updating that entry through the explicit startup command. Rendering and fixture tests do not establish actual Finder/Gatekeeper or login execution on another OS.

## Signing and release status

Local operation and launching the source edition need neither an Apple Developer account nor a Windows signing service. Ordinary users need no developer accounts. Signing is an optional publisher step for public binaries: it establishes the maintainer's distribution identity, separately from users' assistant/CV/provider sign-ins. It does not change the browser interface into a native UI toolkit.

Default packages are **unsigned local candidates**. Public binaries should complete platform signing and native Explorer/Finder/login checks. Keep OS protections enabled. No actual signed or notarized release has been verified by the implementation or fixture tests described here.

`TAWDHEEF_SIGN=required` stops packaging if credentials or signing/verification fail. It never falls back to unsigned. Unset or `unsigned` builds a candidate. Keep private keys, certificates containing private keys and passwords outside source and uploaded artifacts.

### Apple Developer account: prepare the Mac publisher identity

An Apple Developer account alone is not a signing certificate. This workflow needs an active Developer Program membership, a **Developer ID Application** certificate with its private key, and notarization credentials. It distributes the app outside the Mac App Store.

1. On your Mac, create a [certificate signing request](https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request/). As Account Holder, create a **Developer ID Application** certificate using [Apple's instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/), then import the downloaded `.cer` on the Mac that generated the request.
2. In Keychain Access → My Certificates, confirm the matching private key exists. [Export the signing identity](https://developer.apple.com/documentation/xcode/sharing-your-teams-signing-certificates) as a password-protected `.p12`; record its full `Developer ID Application: … (TEAM_ID)` name. The `.cer` alone is insufficient.
3. In App Store Connect → Users and Access → Integrations → App Store Connect API, obtain API access if needed and create a dedicated **team API key** for notarization. Securely download its `.p8` and record its Key ID and Issuer ID. This workflow expects a team key with an issuer. Follow [Apple's API-key guide](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/).
4. In this GitHub repository → Settings → Secrets and variables → Actions, add these repository secrets directly. Do not put certificate files, keys, passwords or their base64 contents in chat, source files, issues or build logs.

| GitHub Actions secret | Value |
| --- | --- |
| `MACOS_CERTIFICATE_P12_BASE64` | Base64 of the exported certificate and private-key `.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | Password chosen for that `.p12` export |
| `MACOS_SIGN_IDENTITY` | Full Developer ID Application identity name |
| `APPLE_NOTARY_KEY_BASE64` | Base64 of the downloaded team API `.p8` key |
| `APPLE_NOTARY_KEY_ID` | That API key's Key ID |
| `APPLE_NOTARY_ISSUER_ID` | Its App Store Connect Issuer ID |

On your Mac, `base64 -i DeveloperID.p12 | pbcopy` and `base64 -i AuthKey.p8 | pbcopy` copy each encoded file locally for pasting directly into its GitHub secret. Use your actual filenames. Base64 is encoding, so protect those values like the original private files.

Run **Actions → Sign verified desktop download** with `platform: macos` and an existing reviewed version tag. It builds Intel and Apple Silicon artifacts using temporary credentials, without publishing. No Windows secrets are required for this selection. See [the workflow](../.github/workflows/sign-desktop.yml) and [secret preflight](../scripts/signing-secrets.mjs).

The driver signs nested code and the bundle with hardened runtime/timestamps, requires Apple notarization status `Accepted`, staples the ticket, and verifies with `codesign`, `stapler` and Gatekeeper. It creates the final archive after stapling and records verification outside the immutable bundle. See [Apple's signing](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac) and [notarization guidance](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

### Windows publisher signing is a separate choice

No Windows signing setup is needed to use Tawdheef locally or to complete the Mac workflow. The current Windows CI route supports an existing, valid, exportable code-signing identity through `WINDOWS_CERTIFICATE_PFX_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD` and `WINDOWS_CERT_SHA1`. A certificate file without its private key is insufficient.

New public certificates commonly use a CA's hardware token, HSM or cloud service, with identity checks, costs and eligibility requirements. A downloadable PFX is not universal. This PFX-import workflow does not implement those service integrations; select a route later if Windows public signing is wanted. See [Microsoft's signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options). A self-signed certificate does not establish public publisher trust.

The Windows driver uses SHA-256 and RFC 3161 timestamps, then verifies the launcher and bundled Node using [SignTool's Authenticode policy](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool). Warnings fail verification. This signs the native executable; the ZIP is not a signed installer or sealed Windows app bundle.

Retain `package-report.json`, the signing receipt and exact-archive smoke receipt. Fixture results or account ownership never establish live signing readiness.

Public links continue to point at existing source releases until actual platform artifacts have been verified and published. No local build or fixture test proves successful live applications, mailbox access or employer responses.
