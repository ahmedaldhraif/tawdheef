import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Mail,
  RefreshCw,
} from "lucide-react";
import ProviderLogo from './ProviderLogo.jsx';

const TABBIO_URL = "https://server.tabbio.com/api/mcp";
const parseObject = (value, label) => {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
};

export default function ConnectionPanel({
  kind,
  conn,
  t,
  close,
  updated,
  notify,
  api,
  Modal,
  safeHref,
  provider,
  back,
  backLabel = 'Back to connections',
}) {
  const email = kind === "email";
  const [values, setValues] = useState(() => ({
    label: conn?.label || (email ? "Gmail" : "Tabbio CV"),
    provider: provider || conn?.provider || (email ? "gmail" : "tabbio"),
    url: conn?.url || (email ? "" : TABBIO_URL),
    command: conn?.command || "",
    args: "[]",
    env: "{}",
    token: "",
    mappings: JSON.stringify(conn?.mappings || {}, null, 2),
  }));
  const [transport, setTransport] = useState(
    conn?.transport === "stdio" ? "stdio" : "http",
  );
  const [method, setMethod] = useState(conn?.adapter && conn.adapter !== 'mcp' ? conn.adapter : conn?.configured ? 'mcp' : (provider === 'icloud-mail' || conn?.provider === 'icloud-mail' ? 'icloud-mail' : provider === 'outlook' || conn?.provider === 'outlook' ? 'outlook' : 'gmail'));
  const [mailUsername, setMailUsername] = useState(conn?.credentialUsername || '');
  const [mailPassword, setMailPassword] = useState('');
  const [clientId, setClientId] = useState(conn?.oauthClientId || '');
  const [clientSecret, setClientSecret] = useState('');
  const [tenant, setTenant] = useState(conn?.oauthTenant || 'common');
  const [integrationInfo, setIntegrationInfo] = useState(null);
  const [tools, setTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localConnection, setLocalConnection] = useState(null);
  const [authUrl, setAuthUrl] = useState(conn?.authUrl || "");
  const [argsEdited, setArgsEdited] = useState(false);
  const [envEdited, setEnvEdited] = useState(false);
  const [mappingsEdited, setMappingsEdited] = useState(false);
  const [endpointEdited, setEndpointEdited] = useState(false);
  const [clearToken, setClearToken] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const [agentConfig, setAgentConfig] = useState(null);
  const [cvResult, setCvResult] = useState(null);
  const instructionsRef = useRef(null);
  const oauthSetupRef = useRef(null);
  const toolsRequest = useRef(0);
  const live = localConnection || conn;
  const connected = live?.status === "connected";

  const field = (key, value) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  const providerName = values.provider === "icloud-mail" ? "iCloud Mail" : values.provider === "outlook" ? "Outlook" : "Gmail";
  const localConfigText = agentConfig
    ? `\n\nLocal tracker MCP configuration:\n${JSON.stringify(agentConfig, null, 2)}`
    : "";
  const setupTask = email
    ? `Set up my ${providerName} connection for this local Apply Tracker. Use list_connections, configure_connection, connect_connection and get_connection_tools from the tracker MCP. Keep any working connection and credentials unless a change is needed. Use an email MCP server or local bridge I have chosen and authorized. Do not invent a server address or try to extract another app's hidden credentials.\n\nThe local app needs its own access so recorded-thread checks and reports can run while Codex or Claude Code is closed. Discover the actual tool schemas. Configure sendEmail and readThread mappings only for supported tools. Check docs/CONNECTIONS.md in the tracker project for the normalized replies and confirmed-send receipt contracts; argument mappings alone do not transform a provider's response. If a bridge or a permission is missing, explain the exact next step. Keep secrets in private local connection settings. Do not send any email, start an application run, or change my schedule during setup. Return to this panel after connecting.${localConfigText}`
    : `Finish the CV connection for this local Apply Tracker using list_connections, connect_connection, get_connection_tools and configure_connection. Preserve the existing Tabbio sign-in and private credentials. Discover Tabbio's actual read-only CV tool and configure a readCV mapping with its required arguments. Do not guess tool names, CV data, analytics, or permissions. If the tracker MCP is not yet configured in this client, use the local configuration below. Do not edit my CV, send an application or change my schedule. Return to this panel when the readCV tool is configured.${localConfigText}`;

  async function loadTools() {
    const request = ++toolsRequest.current;
    setToolsLoading(true);
    try {
      const available = await api(`/connections/${kind}/tools`);
      if (request === toolsRequest.current) setTools(available);
    } catch (failure) {
      if (request === toolsRequest.current) setError(failure.message);
    } finally {
      if (request === toolsRequest.current) setToolsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    api("/agent-config")
      .then((config) => {
        if (mounted) setAgentConfig(config);
      })
      .catch(() => {});
    api('/integrations').then(value => { if (mounted) setIntegrationInfo(value); }).catch(() => {});
    return () => {
      mounted = false;
      toolsRequest.current++;
    };
  }, [api]);

  useEffect(() => {
    // Changes from the assistant become visible without replacing an editor draft.
    setLocalConnection(null);
    if (!endpointEdited) {
      setValues((previous) => ({
        ...previous,
        label: conn?.label || previous.label,
        provider: conn?.provider || previous.provider,
        url: conn?.url || (email ? "" : TABBIO_URL),
        command: conn?.command || "",
        ...(!mappingsEdited
          ? { mappings: JSON.stringify(conn?.mappings || {}, null, 2) }
          : {}),
      }));
      setTransport(conn?.transport === "stdio" ? "stdio" : "http");
    } else if (!mappingsEdited) {
      setValues((previous) => ({
        ...previous,
        mappings: JSON.stringify(conn?.mappings || {}, null, 2),
      }));
    }
    if (conn?.status === "connected") {
      setAuthUrl("");
      loadTools();
    } else {
      toolsRequest.current++;
      setTools([]);
      setToolsLoading(false);
      setAuthUrl(conn?.authUrl || "");
    }
  }, [
    conn?.status,
    conn?.lastConnectedAt,
    conn?.url,
    conn?.command,
    JSON.stringify(conn?.mappings),
  ]);

  async function acceptConnection(connection) {
    setLocalConnection(connection);
    setAuthUrl(connection.authUrl || "");
    const authorization = safeHref(connection.authUrl);
    if (authorization)
      window.open(authorization, "_blank", "noopener,noreferrer");
    if (connection.status === "connected") {
      await loadTools();
      notify(email ? "Email connected" : "Tabbio connected");
    }
    await updated();
  }

  async function reconnect() {
    setBusy(true);
    setError("");
    setAuthUrl("");
    toolsRequest.current++;
    setTools([]);
    try {
      if (email && method !== 'mcp') {
        const native = method === 'gmail' || method === 'outlook';
        const config = {
          adapter: method,
          ...(method === 'icloud-mail' && (mailPassword || conn?.credentialUsername !== mailUsername.trim()) ? { credentials: { username: mailUsername.trim(), password: mailPassword } } : {}),
          provider: values.provider,
          label: method === 'google-cli' ? 'Gmail · Google CLI' : method === 'outlook-mcp' ? 'Outlook · MCP' : providerName,
          ...(native ? { oauth: { clientId: clientId.trim(), ...(method === 'outlook' ? { tenant: tenant.trim() || 'common' } : {}), ...(clientSecret ? { clientSecret } : {}) } } : {}),
        };
        if (native && !clientId.trim() && !integrationInfo?.oauth?.[method === 'gmail' ? 'gmailConfigured' : 'outlookConfigured'] && !conn?.oauthConfigured) {
          if (oauthSetupRef.current) { oauthSetupRef.current.open = true; oauthSetupRef.current.querySelector('input')?.focus(); }
          throw new Error('Add your OAuth client ID in One-time setup, then sign in.');
        }
        // Keep a saved desktop client secret only for the same provider/client ID.
        if (native && !clientSecret && conn?.adapter === method && conn?.oauthClientId === clientId.trim() && (method !== 'outlook' || conn?.oauthTenant === tenant)) delete config.oauth;
        await api(`/connections/${kind}`, 'PUT', config);
        await acceptConnection(await api(`/connections/${kind}/connect`, 'POST', {}));
        setClientSecret('');
        setMailPassword('');
        return;
      }
      const connections = await api("/connections");
      const saved = connections.find((connection) => connection.kind === kind);
      if (email && !saved?.configured) {
        setLocalConnection(saved || null);
        setError(
          "Email setup is not saved yet. Copy the setup instructions to your assistant, or enter your server in Advanced setup.",
        );
        return;
      }
      await acceptConnection(
        await api(`/connections/${kind}/connect`, "POST", {}),
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      await updated().catch(() => {});
      setBusy(false);
    }
  }

  async function saveAndConnect() {
    setBusy(true);
    setError("");
    setAuthUrl("");
    toolsRequest.current++;
    setTools([]);
    setLocalConnection(null);
    try {
      const changedTarget =
        transport === "http"
          ? conn?.transport === "stdio" ||
            (conn?.url || "") !== values.url.trim()
          : conn?.transport !== "stdio" || conn?.command !== values.command;
      const mappings = parseObject(values.mappings, "Tool mappings");
      const config = {
        label: values.label,
        provider: values.provider,
        mappings: changedTarget && !mappingsEdited ? {} : mappings,
        ...(transport === "http"
          ? {
              url: values.url.trim(),
              ...(values.token
                ? { token: values.token }
                : clearToken || changedTarget
                  ? { token: "" }
                  : {}),
            }
          : {
              command: values.command,
              ...(argsEdited || !conn?.hasArgs || changedTarget
                ? { args: JSON.parse(values.args) }
                : {}),
              ...(envEdited || changedTarget
                ? { env: parseObject(values.env, "Environment variables") }
                : {}),
              ...(changedTarget ? { token: "" } : {}),
            }),
        ...(changedTarget
          ? { oauth: {}, ...(transport === "http" ? { env: {} } : {}) }
          : {}),
      };
      if (
        transport === "stdio" &&
        !Array.isArray(config.args) &&
        config.args !== undefined
      ) {
        throw new Error("Arguments must be a JSON list of strings.");
      }
      await api(`/connections/${kind}`, "PUT", config);
      await acceptConnection(
        await api(`/connections/${kind}/connect`, "POST", {}),
      );
      field("token", "");
      setClearToken(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      await updated().catch(() => {});
      setBusy(false);
    }
  }

  async function copySetup() {
    setShowInstructions(true);
    setManualCopy(false);
    try {
      await navigator.clipboard.writeText(setupTask);
      notify("Setup instructions copied");
    } catch {
      setManualCopy(true);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await api(`/connections/${kind}`, "DELETE");
      await updated();
      close();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const mappingExists = (action) => {
    const tool = live?.mappings?.[action]?.tool;
    return (
      typeof tool === "string" &&
      tools.some((available) => available.name === tool)
    );
  };
  const mappingStatus = (action) =>
    toolsLoading
      ? "Checking setup…"
      : mappingExists(action)
        ? "Tool selected"
        : "Needs setup";
  const authHref = safeHref(authUrl);

  return (
    <Modal
      title={email ? t("Connect email") : t("Connect Tabbio CV")}
      close={close}
      t={t}
      pending={busy}
    >
      <div className="connection-panel">
        {back && <button type="button" className="text-button" disabled={busy} onClick={back}>{backLabel}</button>}
        <p className="dialog-intro">
          {email
            ? "Connect your mailbox once. The tracker can then check recorded application replies in the background, even while your AI app is closed."
            : "Sign in to Tabbio to make your digital CV available to this tracker."}
        </p>

        <p className="calendar-provider-title"><ProviderLogo provider={email ? values.provider : 'tabbio'} size={32} decorative /><strong>{email ? providerName : 'Tabbio CV'}</strong></p>

        {email && <>
          <p className="connection-help">{method === 'icloud-mail' ? 'Uses your iCloud Mail address and an app-specific password. No developer account is needed.' : method === 'google-cli' ? 'Uses the Google CLI sign-in saved on this computer. Run npm run connect -- google-cli once, then connect here.' : method === 'outlook-mcp' ? 'Uses the local Outlook MCP bridge. Run npm run connect -- outlook-mcp once, then connect here.' : 'Sign in in your browser. The tracker checks recorded application threads; scheduled checks do not start new applications.'}</p>
          {method === 'icloud-mail' && <>
            <label>iCloud Mail address<input type="email" autoComplete="username" value={mailUsername} onChange={e => setMailUsername(e.target.value)} disabled={busy} placeholder="you@icloud.com" /></label>
            <label>App-specific password<input type="password" autoComplete="new-password" value={mailPassword} onChange={e => setMailPassword(e.target.value)} disabled={busy} placeholder={conn?.hasCredentials ? 'Saved; leave blank to keep' : 'From your Apple Account'} /></label>
            <p className="field-hint"><a href="https://account.apple.com" target="_blank" rel="noreferrer">Create an app-specific password</a> in Sign-In and Security. Use that password here, not your Apple Account password.</p>
          </>}
          {(method === 'gmail' || method === 'outlook') && <details className="advanced" ref={oauthSetupRef}>
            <summary>One-time setup</summary>
            <p className="connection-help">A developer OAuth app identifies this local tracker. Use your own registration or the one supplied by your distributor. Your email password is never entered here.</p>
            <p className="connection-help"><a href={method === 'gmail' ? 'https://developers.google.com/identity/protocols/oauth2/native-app' : 'https://learn.microsoft.com/en-us/graph/auth-register-app-v2'} target="_blank" rel="noreferrer">{method === 'gmail' ? 'Google desktop OAuth guide' : 'Microsoft app registration guide'}</a>. Callback: <code>{window.location.origin}/api/connections/email/oauth/callback</code></p>
            <label>OAuth client ID<input autoComplete="off" disabled={busy} value={clientId} onChange={e => setClientId(e.target.value)} placeholder={conn?.oauthConfigured ? 'Configured by this installation' : 'Client ID from your registration'} /></label>
            {method === 'gmail' && <label>Desktop client secret, if supplied<input type="password" autoComplete="off" disabled={busy} value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder={conn?.hasClientSecret ? 'Saved; leave blank to keep' : 'From the Google desktop client'} /></label>}
            {method === 'gmail' && <label>Import Google desktop credentials<input type="file" accept=".json,application/json" disabled={busy} onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 64000) throw new Error('Choose the small OAuth credentials JSON downloaded from Google.');
                const data = JSON.parse(await file.text());
                if (!data.installed?.client_id || typeof data.installed.client_id !== 'string') throw new Error('Choose credentials for a Google Desktop app. Web app credentials use a different callback setup.');
                setClientId(data.installed.client_id); setClientSecret(data.installed.client_secret || ''); setError('');
                notify('Desktop credentials loaded. Sign in to save them locally.');
              } catch (failure) { setError(failure.message); }
              e.target.value = '';
            }} /></label>}
            {method === 'outlook' && <label>Account directory<select disabled={busy} value={tenant} onChange={e => setTenant(e.target.value)}><option value="common">Personal and work accounts</option><option value="consumers">Personal accounts</option><option value="organizations">Work accounts</option></select></label>}
          </details>}
        </>}

        {connected && (
          <section
            className="connection-readiness"
            aria-label="Connection setup status"
          >
            <p className="connection-state">
              <Check size={17} />
              <strong>
                {live.label || (email ? providerName : "Tabbio")} is connected
              </strong>
            </p>
            <ul className="connection-capabilities">
              {email ? (
                <>
                  <li>
                    <span>Send applications and reports</span>
                    <strong>{mappingStatus("sendEmail")}</strong>
                  </li>
                  <li>
                    <span>Check application replies</span>
                    <strong>{mappingStatus("readThread")}</strong>
                  </li>
                </>
              ) : (
                <li>
                  <span>Read your CV</span>
                  <strong>{mappingStatus("readCV")}</strong>
                </li>
              )}
            </ul>
            <p className="connection-help">
              Tool selection is checked here. Live results appear after a
              supported action completes.
            </p>
          </section>
        )}

        {(email || (connected && !mappingExists("readCV"))) && (
          <details className="advanced assistant-setup">
            <summary>
              {email
                ? "Set up with my assistant"
                : "Finish CV setup with my assistant"}
            </summary>
            <p>
              Copy these instructions into Codex or Claude Code. Your assistant
              will use the connection you choose and check what this tracker
              supports.
            </p>
            <button
              type="button"
              className=""
              disabled={busy}
              onClick={copySetup}
            >
              <Copy />
              {t("Copy setup instructions")}
            </button>
            {showInstructions && (
              <div className="setup-instructions">
                <label>
                  Instructions for your assistant
                  <textarea
                    ref={instructionsRef}
                    className="code-input"
                    readOnly
                    rows={8}
                    value={setupTask}
                    onFocus={(event) => {
                      if (manualCopy) event.target.select();
                    }}
                  />
                </label>
                {manualCopy && (
                  <p className="notice" role="status">
                    Clipboard access is unavailable. Select the instructions
                    above and copy them manually.
                  </p>
                )}
              </div>
            )}
          </details>
        )}

        {!email && connected && mappingExists("readCV") && (
          <section className="cv-actions">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setCvResult(await api("/cv/read", "POST", {}));
                  notify("Tabbio response saved on this computer");
                } catch (failure) {
                  setError(failure.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FileText />
              Read CV
            </button>
            {cvResult && (
              <details className="advanced">
                <summary>Tabbio response</summary>
                <pre>{JSON.stringify(cvResult, null, 2)}</pre>
              </details>
            )}
          </section>
        )}

        {authHref && (
          <a
            className="button auth-link"
            href={authHref}
            target="_blank"
            rel="noreferrer"
          >
            Continue sign-in <ExternalLink size={14} />
          </a>
        )}

        <details className="advanced">
          <summary>{t("Advanced setup")}</summary>
          {!email && <button type="button" disabled={busy} onClick={async () => {
            setBusy(true); setError('');
            try {
              const presets = await api('/integrations/presets'); const preset = presets.find(item => item.id === 'tabbio');
              if (!preset?.ready) throw new Error('Run npm run setup -- --tabbio, then npm run connect -- tabbio to sign in to the local Tabbio CLI.');
              await api('/connections/tabbio', 'PUT', { adapter: 'mcp', provider: 'tabbio', label: 'Tabbio CV', command: preset.command, args: preset.args, env: preset.env, mappings: {} });
              await acceptConnection(await api('/connections/tabbio/connect', 'POST', {}));
            } catch (failure) { setError(failure.message); } finally { setBusy(false); }
          }}>Use local Tabbio CLI</button>}
          {email && <label>Connection method<select value={method} disabled={busy} onChange={e => setMethod(e.target.value)}>
            <option value={values.provider}>{`Built-in ${providerName}`}</option>
            {values.provider !== 'icloud-mail' && <option value={values.provider === 'outlook' ? 'outlook-mcp' : 'google-cli'}>{values.provider === 'outlook' ? 'Local Outlook MCP bridge' : 'Local Google CLI'}</option>}
            <option value="mcp">Custom MCP server</option>
          </select></label>}
          {(!email || method === 'mcp') && <>
          <p>
            Use a server or local bridge you trust. Credentials stay in this
            app’s private local connection settings.
          </p>
          <label>
            Connection type
            <select
              value={transport}
              disabled={busy}
              onChange={(event) => {
                setEndpointEdited(true);
                setTransport(event.target.value);
              }}
            >
              <option value="http">MCP server address</option>
              <option value="stdio">Local MCP command</option>
            </select>
          </label>
          {transport === "http" ? (
            <>
              <label>
                {t("Server address")}
                <input
                  type="url"
                  disabled={busy}
                  placeholder={
                    email ? "Your email MCP server address" : TABBIO_URL
                  }
                  value={values.url}
                  onChange={(event) => {
                    setEndpointEdited(true);
                    field("url", event.target.value);
                  }}
                />
              </label>
              <label>
                Access token, if required
                <input
                  type="password"
                  disabled={busy}
                  autoComplete="off"
                  placeholder={
                    conn?.hasToken
                      ? "A token is saved; leave blank to keep it"
                      : "Leave blank for browser sign-in"
                  }
                  value={values.token}
                  onChange={(event) => field("token", event.target.value)}
                />
              </label>
              {conn?.hasToken && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={clearToken}
                    onChange={(event) => setClearToken(event.target.checked)}
                  />
                  Remove the saved access token
                </label>
              )}
            </>
          ) : (
            <>
              <label>
                Command
                <input
                  disabled={busy}
                  value={values.command}
                  placeholder="node"
                  onChange={(event) => {
                    setEndpointEdited(true);
                    field("command", event.target.value);
                  }}
                />
              </label>
              <label>
                Arguments (JSON)
                {conn?.hasArgs && !argsEdited && (
                  <span className="connection-help">
                    {conn.argCount} saved arguments are kept unless you replace
                    them.
                  </span>
                )}
                <textarea
                  rows={2}
                  disabled={busy}
                  value={values.args}
                  onChange={(event) => {
                    setArgsEdited(true);
                    field("args", event.target.value);
                  }}
                />
              </label>
              <label>
                Environment variables (JSON)
                <textarea
                  rows={2}
                  className="code-input"
                  disabled={busy}
                  value={values.env}
                  onChange={(event) => {
                    setEnvEdited(true);
                    field("env", event.target.value);
                  }}
                />
              </label>
              <p className="connection-help">
                Saved secret values are private and are not displayed here.
                Replacing the command clears its old credentials.
              </p>
            </>
          )}
          <label>
            Tool mappings (JSON)
            <textarea
              className="code-input"
              rows={6}
              disabled={busy}
              value={values.mappings}
              onChange={(event) => {
                setMappingsEdited(true);
                field("mappings", event.target.value);
              }}
            />
          </label>
          <p className="connection-help">
            The assistant can map sendEmail, readThread and readCV from the
            discovered tool schemas. The expected response formats are in
            docs/CONNECTIONS.md.
          </p>
          <button
            type="button"
            disabled={
              busy ||
              !(transport === "http"
                ? values.url.trim()
                : values.command.trim())
            }
            onClick={saveAndConnect}
          >
            {busy ? "Connecting…" : "Save and connect"}
          </button>
          </>}
        </details>

        {tools.length > 0 && (
          <details className="advanced">
            <summary>Available tools ({tools.length})</summary>
            <div className="tool-list">
              {tools.map((tool) => (
                <details key={tool.name}>
                  <summary>{tool.name}</summary>
                  <p>{tool.description}</p>
                  <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                </details>
              ))}
            </div>
          </details>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!error && live?.lastError && (
          <p className="form-error" role="alert">
            {live.lastError}
          </p>
        )}

        <div className="form-actions">
          {live?.configured && (
            <button
              type="button"
              className="danger-text push-left"
              disabled={busy}
              onClick={disconnect}
            >
              {t("Disconnect")}
            </button>
          )}
          <button type="button" disabled={busy} onClick={close}>
            {t("Close")}
          </button>
          {email ? (
            <button type="button" className="primary" disabled={busy} onClick={reconnect}>
              {busy ? "Connecting…" : method === 'gmail' || method === 'outlook' ? `Sign in to ${providerName}` : 'Connect email'}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={reconnect}
            >
              {busy
                ? "Connecting…"
                : connected
                  ? "Reconnect Tabbio"
                  : "Sign in to Tabbio"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
