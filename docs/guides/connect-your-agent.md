# Connect Codex or Claude Code

Choose one assistant. Tawdheef supplies the local tracker tools and workflow; your existing assistant account supplies the model.

## Connect this project

1. Start Tawdheef and open its folder in the assistant you use. Sign into that assistant’s own account.
2. Ask it to follow the setup request in [Get started](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/FIRST-RUN.md), or run the command for your client shown below in the Tawdheef folder.
3. Accept the client’s project/server trust prompt. Start a new chat if the tools do not appear immediately.
4. In Tawdheef, open **Connections → Assistant**, choose that client and paste **Copy setup request** into its existing chat. It checks its actual tools and reports dated metadata.

### Manual project connection

For Codex:

```sh
npm run agent -- codex
```

For Claude Code:

```sh
npm run agent -- claude-code
```

The commands create project-only MCP settings and install the Tawdheef skill. They preserve custom files. If a conflict appears, export entries with `npm run setup -- --export-config agent-config`, then review and merge them using the [manual connection guide](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/AGENT-GUIDE.md#connect-once). Add `--tabbio` to the agent command only when you want to add direct Tabbio MCP to that client. Accept its normal OAuth and trust prompts.

## Add browser tools when needed

Reuse the actual client's supported browser/computer tools and authorized sessions. In **Connections → Browser & computer use**, copy its setup request. The client checks availability; a browser check does not prove OS computer control. Unsupported tools and sign-in become **Needs you**.

No browser engine is installed into Tawdheef by default. The optional app-owned compatibility path is separate:

```sh
npm run setup -- --local-adapters --browser
```

Choose that path only when you explicitly want local adapters. Native **Run** prepares a scoped request for the existing chat and never launches another model or CLI subprocess.

## Install just the skill

If the app is already connected and you only need its workflow guidance:

```sh
npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef
```

A skill alone does not install the app or connect an account. In Codex, refer to `$tawdheef`; in Claude Code, use `/tawdheef`.

## Expected result

Your client can call `get_agent_context` and `get_capabilities`. Tawdheef records that local tool use separately from the client's dated external-access reports. It does not independently verify model access or provider sign-in. Check the actual CV before making matching decisions.
