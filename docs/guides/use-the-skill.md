# Set up Tawdheef with your agent

## Install

Download Tawdheef from [GitHub Releases](https://github.com/ahmedaldhraif/tawdheef/releases) and extract the app's source ZIP.

[app-download]: #

Open the extracted folder in your installed, signed-in **Codex or Claude Code**. You need [Node.js 24 or newer](https://nodejs.org/en/download); your agent can guide you if it is missing.

## Agent

Copy [the setup request](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/FIRST-RUN.md#give-your-agent-one-setup-request) into your assistant with the Tawdheef folder open. It checks existing setup, starts the app and connects the local tools and workflow skill.

[setup-prompt]: #

Complete sign-ins and account choices in **Connections**. Accept your assistant's project/server trust prompt when shown, then use **Check connections**.

Use the local Codex or Claude Code client; ChatGPT and Claude web chats do not read the app's local MCP settings.

### If you prefer the terminal

Run these from the extracted folder to install browser tools, connect Codex and start the app:

```sh
npm run setup -- --browser
npm run agent -- codex --browser
npm start
```

For Claude Code, replace the second command with:

```sh
npm run agent -- claude-code --browser
```

This creates project-only MCP settings and installs the skill. Existing custom settings are preserved; follow the reported merge instructions if they conflict. Reopen the project or start a new chat so your assistant loads the tools. The screen, CLI and MCP use the same local records.

`npm run setup -- --all` also installs the separate Tabbio CLI. It is optional for this setup. See [Connect your agent](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/connect-your-agent.md) for connection details.

## CV

1. [Create your free CV](https://app.tabbio.com/?utm_source=tawdheef&utm_medium=setup&utm_campaign=live_cv) on Tabbio, or use your existing account. Add and review your real experience, education and skills.
2. In Tawdheef, open **Connections → Your CV → Tabbio CV → Connect** and complete sign-in.
3. Choose your assistant in **Connections**, then use **Check connections**. It checks the assistant's sign-in and reads your connected CV.

A readable connected CV is required before Run. You can browse directories and track records without it. See [Create or connect your CV](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/connect-your-cv.md) if the read needs attention.

Your agent can make the same final check with `get_setup_status`, using `verify:true` and the chosen assistant. For the CLI, save this as `.local/setup-check.json`, replacing `codex` with `claude-code` if needed:

```json
{"verify":true,"assistant":"codex"}
```

Then run:

```sh
node bin/apply-tracker.mjs call get_setup_status --input-file .local/setup-check.json
```

Use your configured private data folder if you changed `APPLY_TRACKER_DATA`.

To use Tabbio's separate CLI, you can optionally run `npm run setup -- --login tabbio` and complete its sign-in. Follow the [official Tabbio connection guide](https://www.tabbio.com/en/mcp). Tawdheef reads your connected CV; editing or publishing it through Tabbio is a separate connection and request.

## Workflow

Choose the bundled UAE directory or [add a country pack](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/use-directory-packs.md). Filter or select your target companies, describe the roles and locations you want, then start **Run** for that scope.

Your agent checks source evidence and your real CV, then records actual results and next actions. Career profiles, CV uploads and confirmed job applications are separate outcomes. [Read the run guide](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/apply-to-jobs.md).

## Use

In Codex, mention `$tawdheef`. In Claude Code, use `/tawdheef`. Give your agent a task below, replacing bracketed text with your own targets or preferences.

### Already connected? Install just the skill

App setup already installs the skill. If you only need its guidance in another supported assistant, run:

```sh
npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef
```

Choose your assistant in the installer. This adds guidance; it does not install the app, connect MCP tools, sign into accounts or authorise job-search actions. [Read the actual skill source](https://github.com/ahmedaldhraif/tawdheef/blob/main/skills/tawdheef/SKILL.md).

### Prompts

Find a shortlist:

```text
Shortlist 10 companies in [directory] for [role and location]. Check the source evidence and my connected CV. Explain the fit and missing information. Do not apply or send messages.
```

Start an explicit application run:

```text
Start an application run for [company names] in [directory] for [role and location]. Use my real CV, check duplicates and apply to suitable roles within that scope. Record confirmations and anything that needs me.
```

Review existing work:

```text
Check replies for my tracked application threads. Summarise real changes and next actions, then save a local report. Do not start applications, send follow-ups or email the report.
```

## Permissions

Setup and skill installation do not authorise applications, profiles or CV sharing. A requested run covers only the targets and actions you requested. Sign-ins, CAPTCHAs and provider approvals may need you; LinkedIn application steps remain manual. An application needs a real receipt or confirmation, while profile work keeps its own evidence.

## Privacy

Tracking data and credentials stay in your local app folder. Connected AI, CV and email services process data under their own permissions and terms. Enter private credentials in Connections, not in chat or public issues.

Tawdheef is free; your assistant account and connected services may have their own costs. [Read the privacy guide](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/policies/PRIVACY.md).
