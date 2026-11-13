# Fix a setup or run problem

Start with the app’s connection check and its next action. Keep existing settings and tracking data while you fix the missing part.

## Find the blocker

1. If the app does not open, run the startup commands below in the Tawdheef folder.
2. If the app opens, go to **Connections**, choose your assistant and use **Check connections**.
3. Follow the matching fix below, then check again.

```sh
npm start
npm run doctor
```

## The app will not start

Install [Node.js 24 or newer](https://nodejs.org/en/download), then reopen the terminal and run `npm start`. First launch needs internet to install dependencies. On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd start` or **Start Tawdheef.cmd**; you do not need to change the system execution policy.

If another app is using the port, keep the exact error and ask your setup agent to identify it. Do not start a second tracker against a different data folder.

## The assistant is installed but Run cannot use it

Open Codex or Claude Code and finish its sign-in. Choose that same assistant in Connections and check again. Usage-limit errors belong to the assistant account; resolve them before another run. If tools are missing in an existing chat, accept its project/server trust prompt and start a new chat.

## The CV is connected but cannot be read

Open **Connections → Tabbio CV** and finish any sign-in or access step. Ask your setup agent to check the available CV read tool if the app needs a mapping. Do not guess a CV ID or invent tool names. Then use **Check connections** again.

## Browser forms or email are unavailable

For browser forms, ask your setup agent to install the browser with `npm run setup -- --browser`. For Gmail or Outlook, complete the provider’s one-time OAuth setup linked in Connections. iCloud Mail uses an Apple app-specific password entered in its local form.

A site’s CAPTCHA or login may need you even after setup is ready. Check an uncertain submission for a receipt before trying again.

## A pack import looks incomplete

Extract the ZIP first and read `manifest.json` → `files.imports`. Import every listed CSV part into the same chosen tab. Review warnings instead of replacing the existing directory or dropping records to make the count fit.

## Expected result

The connection check reports **Ready**, or identifies one remaining action you can complete. Your existing tracker records and custom settings are preserved.
