# Fix a setup or run problem

Start with the connection's dated status and its **Copy setup request**. The actual client checks its own tools and reports one missing step. Preserve settings and tracking data.

## Find the blocker

1. If the app does not open, run the startup commands below in the Tawdheef folder.
2. If the app opens, go to **Connections**, choose your assistant and paste its setup request into that existing chat.
3. Follow the matching fix below, then check again.

```sh
npm start
npm run doctor
```

## The app will not start

The prebuilt app includes Node and its interface; extract the complete folder and open its launcher. Source users need [Node.js 24 or newer](https://nodejs.org/en/download), then `npm start`; first source launch needs internet for dependencies. On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd start` or **Start Tawdheef.cmd** without changing the system execution policy. Publisher warnings and signed-download availability are separate from local setup; do not disable system security.

If another app is using the port, keep the exact error and ask your setup agent to identify it. Do not start a second tracker against a different data folder.

## The assistant is installed but Run cannot use it

Native Run copies a request for your existing Codex or Claude Code client; it does not require a separately installed CLI. Choose that client and paste the request there. Finish its sign-in or account-limit step. If tracker tools are missing, accept the normal project/server trust prompt and reload the project. The optional compatibility CLI runner is a separate Advanced mode.

## The CV is connected but cannot be read

Open **Connections → Tabbio CV**, copy its setup request and check the actual Tabbio tool in the selected client. Complete sign-in/consent there. Never guess a CV ID or tool name. Report fresh source metadata only after a real read; **Unknown** can mean missing or stale metadata rather than a disconnected account.

## Browser forms or email are unavailable

Copy the corresponding setup request into the actual client. Reuse its supported browser/computer or mail integration and normal sign-in. Support differs by client; if a tool is unavailable, record **Needs you**. Passwords remain in your browser/password manager. App-owned adapters require an explicit Advanced compatibility choice and `npm run setup -- --local-adapters`; they are not the default solution.

A site’s CAPTCHA or login may need you even after setup is ready. Check an uncertain submission for a receipt before trying again.

## A pack import looks incomplete

Extract the ZIP first and read `manifest.json` → `files.imports`. Import every listed CSV part into the same chosen tab. Review warnings instead of replacing the existing directory or dropping records to make the count fit.

## Expected result

The client reports what it actually checked and one **Needs you** step when blocked. Tawdheef shows dated reports rather than claiming independent external verification. Existing records and custom settings remain preserved.
