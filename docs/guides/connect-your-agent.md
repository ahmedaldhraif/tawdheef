# Connect Codex or Claude Code

Your actual client supplies the model and external tools. Tawdheef supplies the local records and workflow.

## Connect this project

1. Start Tawdheef and open **Connections → Assistant**.
2. Choose your client and **Copy setup request**.
3. Paste it into that client. Reuse existing connections and accept project/server trust there.
4. Ask it to call `get_agent_context`, `get_capabilities` and `get_native_client_status`.

A dated Client reported observation is not independent verification of login or model access. Missing access remains Needs you.

### Manual project connection

Run one command from the source folder:

```sh
npm run agent -- codex
```

Or use `npm run agent -- claude-code`. `--check` previews changes. Custom/global settings remain intact. Packages use their own setup request and bundled Node paths.

## Add browser tools when needed

Copy the request from the relevant Connections row. Your client checks its actual browser, computer, mail, calendar or password-manager capability. Tawdheef does not install another app-owned browser or provider session. Support depends on the client, account and permission.

## Install just the skill

{{skill-install}}

A skill adds instructions, not tools or sign-in. [First setup](https://github.com/ahmedaldhraif/tawdheef-auto-apply-jobs/blob/main/docs/guides/use-the-skill.md).

## Expected result

Your selected client can use tracker MCP and report observed capabilities. Configuration alone is not a connected account.
