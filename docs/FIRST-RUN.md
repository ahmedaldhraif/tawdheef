# Let your agent set up Tawdheef

Tawdheef is an **Auto Job Apply & Application Tracker** for your computer.
Find jobs that fit your CV and build career profiles for future opportunities,
even when no suitable job is open.
The app is free; your coding assistant and connected services may have their
own plans or costs.

## Get the folder

Start at [Tawdheef on GitHub](https://github.com/ahmedaldhraif/tawdheef).
Download `tawdheef-VERSION-source.zip` from the
[release list](https://github.com/ahmedaldhraif/tawdheef/releases) and extract it,
or clone the repository:

```sh
git clone https://github.com/ahmedaldhraif/tawdheef.git
cd tawdheef
```

Use the app's source ZIP, not a country directory ZIP, to install Tawdheef.
For source downloads, use [Node.js 26 LTS](https://nodejs.org/en/download)
(patched Node 24 remains compatible) and one signed-in coding assistant.
`npm start` installs missing source dependencies without optional bridges,
builds the tracker and opens [the local tracker](http://127.0.0.1:4000/).
Platform app packages already contain Node and the interface: extract the whole
folder and use the Windows or Mac launcher. See [desktop release status](DESKTOP-RELEASE.md).

## Give your agent one setup request

Open the downloaded Tawdheef folder in **Codex or Claude Code**. You only need one. Paste this:

> Set up Tawdheef for me in this folder. Read AGENTS.md and docs/FIRST-RUN.md. Check what already works, then install missing project dependencies, start the app, add browser tools, and connect this project to the assistant I am using. Keep existing settings and data. Help me create or connect my free Tabbio CV using only my real information. Guide me through only the sign-ins or choices that need me; I will enter credentials in the local connection form. Check setup again and tell me the next step. Use get_setup_status (verify:true for the final check), or the equivalent CLI command. Do not change the app's code or design, send applications, create calendar events, or enable schedules during setup.

In the app, open **Connections**, choose Codex or Claude Code under **AI assistants**, and use **Copy setup request**. Paste it into that assistant with this folder open. Provider sign-ins, assistant choice and connection checks all live in Connections; the detailed commands stay in these guides.

## Your part

1. **Open the folder in your assistant.** The platform app contains Node. For a source download, install [Node.js 26 LTS](https://nodejs.org/en/download) if needed. The agent then starts the app for you.
2. **Create or connect your CV.** Open **Connections → Your CV → Tabbio CV → Connect** and finish the sign-in. No CV yet? [Create your free digital CV](https://app.tabbio.com), save your real experience, then return here to connect it. Choose your assistant in Connections and use **Check connections** to confirm a fresh CV read. A readable connected CV is required before Run.
3. **Choose a country directory.** The original UAE snapshot is bundled. Download another [GitHub directory pack](../directories/README.md), extract it, add or select a tab and use **List options → Import list**. Preview and import every numbered CSV part into that same tab. Importing a pack does not start applications.
4. **Check connections, then Run.** Choose your assistant in Connections and use **Check connections**. Filter or select companies in the list, then open **Run**. Matching applications and career profiles start selected; change either choice if needed. When no suitable role is found, the profile choice lets your agent create an account, fill your career profile and upload your CV where the company offers those steps. CV-only email is a separate unchecked choice. Add a note only if you have extra preferences. Pressing Run starts your selected actions for those targets.

You can apply through browser tools without connecting email. Calendar and daily/weekly reports can wait. Fresh installs leave automatic checks and reports off; existing schedule choices are preserved. Add accounts later in Connections and configure schedules through the Settings gear.

Account, profile and CV progress is tracked separately from applications. An account alone does not prove the company received your CV. Your agent reuses existing accounts, records confirmations and asks for you when sign-in or a required declaration needs your action.

## What “ready” means

Your agent handles installation and project setup; you complete account sign-ins
and enter private credentials in Connections. Tawdheef reads your authorised
CV. Updating or sharing it through [Tabbio MCP or CLI](https://www.tabbio.com/en/mcp)
is a separate connection and task, not a tracker write capability.

The verified check inspects the chosen assistant's version, required command flags and local sign-in state, checks a real isolated tracker MCP connection, reads your connected CV, and opens a blank page in an isolated browser profile when browser tools are used. A configured email route can be used without browser tools. Installing a client alone is not sign-in. A saved account alone is not proof that a fresh CV read works. Setup never starts a model task or sends a test application or email; provider permissions, usage limits and individual websites can still need attention during a run.

**One-time setup** and **Advanced setup** retain the necessary local credential fields. The assistant explains provider registration or client configuration using [CONNECTIONS.md](CONNECTIONS.md) and [AGENT-GUIDE.md](AGENT-GUIDE.md); the person enters private values and completes consent in the app or provider sign-in page.

| Account | One-time setup |
| --- | --- |
| Codex or Claude Code | Install one client and sign into your own account. Accept its project/server trust prompt when shown. |
| Tabbio CV | Connect your own Tabbio account and allow the CV read. Required for the app's Run button. |
| Gmail or Outlook | Supply your own developer OAuth registration, then sign in. This release does not include a shared publisher registration. The agent can guide you through the linked provider steps. |
| iCloud Mail | Enter your iCloud Mail address and an Apple app-specific password in the local form. No developer registration is needed. |
| Calendar | Optional, with separate consent. Connecting it does not create events. |

## Agent checklist

Use this only when the user asks for setup. Ordinary job-search runs do not authorize installation or client-setting changes.

1. Read `AGENTS.md`. Confirm this is the intended checkout and inspect the existing Node version, app process, data path and selected client. Reuse working parts. Do not launch a second app against a different private-data folder.
2. For source downloads, use Node.js 26 LTS and run `npm start` for missing dependencies, build and local startup. In a platform app, use its launcher and bundled `runtime/node.exe` (Windows) or `runtime/bin/node` (Mac/Linux) for CLI commands when no system Node is installed. Run the doctor and `get_setup_status` for current gaps; CLI commands use the same bundled runtime.
3. For the requested browser workflow, install missing browser tools with `npm run setup -- --browser`. Then configure only the chosen client with `npm run agent -- codex --browser` or `npm run agent -- claude-code --browser`. This adds tracker and browser tools to that chat and installs the skill. The app's Run button supplies its own scoped browser tools; the flag is for existing chats. Existing custom files must remain intact; inspect a conflict and merge only the missing entries from exported configuration instead of deleting or replacing the file. No home-directory settings are changed by these commands.
4. Guide the user to **Connections** for their CV and any chosen mailbox. The AI assistants section chooses the assistant used by Run; **Check connections** verifies that selected assistant and the CV. Use the app's actual connection tools and returned sign-in URL. Let the user complete sign-in, consent, app-password entry and client trust. Never request secrets in chat, invent provider mappings or copy credentials into notes. The tracker needs no model API key.
5. Call `get_setup_status` with `verify:true` and the chosen `assistant` (`codex` or `claude-code`). This checks the assistant's sign-in state and reads the connected CV through the running app. It does not start a model task, send mail or submit forms. If MCP requires a new chat, use the CLI with an input file containing the same arguments.
6. Finish with **Ready** and the next action, or **Needs you** and one concrete blocker. State what was actually checked. Do not enable startup, schedules, email reports, calendar writes or application runs unless separately requested.

For CLI verification, save this as a private JSON input file, choosing the correct assistant:

```json
{"verify":true,"assistant":"codex"}
```

```sh
node bin/apply-tracker.mjs call get_setup_status --input-file setup-check.json
```

Use [QUICKSTART.md](QUICKSTART.md) for manual setup, backups and optional integrations. Use [AGENT-GUIDE.md](AGENT-GUIDE.md) for day-to-day operations after setup.
