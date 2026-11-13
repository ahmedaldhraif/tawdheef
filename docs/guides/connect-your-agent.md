# Connect Codex or Claude Code

Choose one assistant. Tawdheef supplies the local tracker tools and workflow; your existing assistant account supplies the model.

## Connect this project

1. Start Tawdheef and open its folder in the assistant you use. Sign into that assistant’s own account.
2. Ask it to follow the setup request in [Get started](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/FIRST-RUN.md), or run the command for your client shown below in the Tawdheef folder.
3. Accept the client’s project/server trust prompt. Start a new chat if the tools do not appear immediately.
4. In Tawdheef, open **Connections**, choose that assistant under **AI assistants**, then use **Check connections**.

### Manual project connection

For Codex:

```sh
npm run agent -- codex
```

For Claude Code:

```sh
npm run agent -- claude-code
```

The commands create project-only MCP settings and install the Tawdheef skill. They preserve existing custom files. If a conflict appears, use the configuration shown in Connections to merge the missing entries rather than replacing your settings.

## Add browser tools when needed

For website forms, ask your setup agent to install the browser:

```sh
npm run setup -- --browser
```

The app’s **Run** supplies its own scoped tools. To add browser tools to an existing Codex chat, use `npm run agent -- codex --browser`; use `claude-code` instead for that client.

## Install just the skill

If the app is already connected and you only need its workflow guidance:

```sh
npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef
```

A skill alone does not install the app or connect an account. In Codex, refer to `$tawdheef`; in Claude Code, use `/tawdheef`.

## Expected result

Your client can call `get_agent_context` and `get_capabilities`. A connection check confirms the chosen assistant’s sign-in state. It can still ask you to finish the CV connection before Run is ready.
