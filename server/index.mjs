import express from "express";
import { resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { openStore, ROOT, STATUSES, AppError } from "./store.mjs";
import { parseDirectory } from "./import.mjs";
import {
  backgroundStatus,
  installBackground,
  uninstallBackground,
} from "../scripts/background.mjs";
import { createClientConfig, integrationStatus, integrationPresets } from './integrations.mjs';
import { monitoringRecipe, capabilityRecipe, registrationContext } from './client-guidance.mjs';
import { saveCvArtifact, getCvArtifactStatus, stageCvArtifact, MAX_CV_ARTIFACT_BYTES } from './cv-artifacts.mjs';
import { assertRunPurpose } from '../src/run-actions.js';
import { nativeConnectionRequest, nativeRunRequest, nativeSetupStatus } from './native-guidance.mjs';
import { createLocalAdapterOwner } from './local-adapter-owner.mjs';

const port = Number(process.env.APPLY_TRACKER_PORT || 4000);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Choose a port between 1024 and 65535.");
const baseUrl = `http://127.0.0.1:${port}`;
const store = openStore();
const nativeMode = () => store.getSettings().connectionMode !== 'local-adapters';
const adapterOwner = createLocalAdapterOwner({ isNative: nativeMode, ErrorType: AppError, loadFactory: async () => {
  const { createLocalAdapterServices } = await import('./local-adapter-services.mjs');
  return () => createLocalAdapterServices({ store, port, baseUrl });
} });
const localAdapters = () => adapterOwner.get();
const deferred = key => new Proxy({}, { get: (_target, method) => (...args) => localAdapters().then(services => services[key][method](...args)) });
const connections = deferred('connections'), agentRunner = deferred('agentRunner'), agentCheck = deferred('agentCheck'), scheduler = deferred('scheduler'), monitoring = deferred('monitoring');
const setupStatus = input => nativeMode() ? nativeSetupStatus({ store, ...input }) : localAdapters().then(services => services.setupStatus(input));
const nativeRun = input => { const result = store.startNativeRun(input); return { ...result, handoff: nativeRunRequest({ store, runId: result.run.id }) }; };
const runView = id => { const run = store.getRun(id); return run.native ? { ...store.getNativeRun({ runId: id }), targets: store.listNativeTargets({ runId: id, limit: 20 }).items } : run; };
const stopRun = id => {
  const run = store.getRun(id);
  if (run.native) return store.stopNativeRun({ runId: id });
  if (!run.managed) return run.status === 'running' ? store.updateRun(id, { status: 'cancelled' }) : run;
  return agentRunner.stop(id);
};
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  const host = req.headers.host || "";
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host))
    return res
      .status(403)
      .json({ error: "This tracker is only available on this computer." });
  if (
    req.headers.origin &&
    ![baseUrl, `http://localhost:${port}`].includes(req.headers.origin)
  )
    return res
      .status(403)
      .json({ error: "Open the tracker directly to make changes." });
  if (
    req.headers["sec-fetch-site"] === "cross-site" &&
    req.path.startsWith("/api/") &&
    !req.path.includes("/oauth/callback")
  )
    return res
      .status(403)
      .json({ error: "Cross-site requests are not allowed." });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "30mb" }));
// Older setup and skill links lead directly to the shared setup guide.
app.get(["/skills/tawdheef", "/skills/tawdheef/", "/get-started", "/get-started/", "/guides/get-started", "/guides/get-started/"], (_request, response) => response.redirect(301, "/guides/use-the-skill/"));
const wrap = (fn) => async (req, res, next) => {
  try {
    const value = await fn(req, res);
    if (!res.headersSent) res.json(value ?? { ok: true });
  } catch (error) {
    next(error);
  }
};
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    app: "apply-tracker",
    instanceId: process.env.APPLY_TRACKER_INSTANCE || null,
    port,
  }),
);
app.get(
  "/api/agent-config",
  wrap(async req => {
    const include = req.query.include ? String(req.query.include).split(',') : [];
    const config = await createClientConfig({ dataDir: store.dataDir, port, include, mode: nativeMode() ? 'native' : 'local-adapters', assistant: req.query.assistant || store.getSettings().preferredAssistant });
    return { mcpServers: config.mcpServers };
  }),
);
app.get('/api/integrations', wrap(() => integrationStatus({ dataDir: store.dataDir, port, mode: nativeMode() ? 'native' : 'local-adapters' })));
app.get('/api/integrations/presets', wrap(() => nativeMode() ? [] : integrationPresets({ dataDir: store.dataDir, port })));
app.get('/api/setup-status', wrap(req => setupStatus(req.query.assistant ? { assistant: req.query.assistant } : {})));
app.post('/api/setup-status/check', wrap(req => setupStatus({ ...req.body, verify: true })));
app.get('/api/native/client', wrap(req => store.getNativeClientStatus(req.query.assistant ? { assistant: req.query.assistant } : {})));
app.post('/api/native/client/report', wrap(req => store.reportNativeConnection(req.body)));
app.get('/api/native/connection-request', wrap(req => nativeConnectionRequest({ store, ...req.query })));
app.post('/api/native/runs', wrap(req => nativeRun(req.body)));
app.post('/api/native/runs/:id/request', wrap(req => nativeRunRequest({ store, runId: req.params.id })));
app.post('/api/native/runs/:id/claim', wrap(req => store.claimNativeTarget({ ...req.body, runId: req.params.id })));
app.post('/api/native/runs/:id/finish', wrap(req => store.finishNativeTarget({ ...req.body, runId: req.params.id })));
app.post('/api/native/runs/:id/claim/check', wrap(req => store.getNativeClaim({ ...req.body, runId: req.params.id })));
app.post('/api/native/email/prepare', wrap(req => store.prepareNativeEmail(req.body)));
app.post('/api/native/email/resolve', wrap(req => store.resolveNativeEmail(req.body)));
app.get('/api/assistant-check', wrap(req => agentCheck.get({ assistant: req.query.assistant || store.getSettings().preferredAssistant })));
app.post('/api/assistant-check', wrap(req => agentCheck.verify(req.body)));
app.get('/api/agent-capabilities/recipe', wrap(req => capabilityRecipe({ assistant: req.query.assistant || store.getSettings().preferredAssistant, kind: req.query.kind })));
app.get('/api/registration-context', wrap(async req => {
  if (!nativeMode()) return registrationContext({ store, connections: (await localAdapters()).connections, companyId: req.query.companyId });
  const client = store.getNativeClientStatus({ assistant: req.query.assistant || store.getSettings().preferredAssistant });
  return { primaryEmail: client.primaryEmail, emailSource: client.primaryEmail ? 'native_client_report' : null, clientReported: true, independentlyVerified: false,
    company: req.query.companyId ? store.getCompany(req.query.companyId) : null,
    instructions: 'Reuse existing career accounts and their original login. For a new registration use only this fresh observed main email. If missing, check the actual client mailbox identity. Passwords stay in the browser/password manager; sign-in and identity prompts become Needs you.' };
}));
app.get('/api/monitoring', wrap(() => store.getMonitoring()));
app.patch('/api/monitoring', wrap(req => store.configureMonitoring(req.body)));
app.post('/api/monitoring/scope', wrap(req => store.snapshotMonitoringScope(req.body)));
app.post('/api/monitoring/recipe', wrap(req => monitoringRecipe({ store, ...req.body })));
app.post('/api/monitoring/check', wrap(req => nativeMode() ? store.beginNativeMonitoringCheck(req.body) : monitoring.check(req.body)));
app.post('/api/monitoring/observations', wrap(req => {
  if (nativeMode()) return store.recordNativeMonitoringCheck(req.body);
  const check = store.getMonitoringCheck({ id: req.body.id, token: req.body.token });
  if (!['jobs', 'profiles'].includes(check.source.kind)) throw new AppError('Connected mail/calendar observations are recorded by the local provider reader.');
  return monitoring.record(req.body);
}));
app.get('/api/monitoring/updates', wrap(req => store.listMonitoringUpdates({ ...req.query,
  ...(req.query.limit ? { limit: Number(req.query.limit) } : {}), ...(req.query.offset ? { offset: Number(req.query.offset) } : {}),
  ...(req.query.unread !== undefined ? { unread: req.query.unread === 'true' } : {}), ...(req.query.compact !== undefined ? { compact: req.query.compact !== 'false' } : {}) })));
app.post('/api/monitoring/updates/:id/ack', wrap(req => store.acknowledgeMonitoringUpdate({ id: req.params.id, expectedRevision: req.body.expectedRevision })));
app.get('/api/cv/file', wrap(() => getCvArtifactStatus({ dataDir: store.dataDir })));
app.post('/api/cv/file', wrap(req => {
  if (!req.body || Object.keys(req.body).some(key => !['filename', 'contentBase64'].includes(key)) || typeof req.body.contentBase64 !== 'string' || req.body.contentBase64.length > Math.ceil(MAX_CV_ARTIFACT_BYTES * 4 / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(req.body.contentBase64)) throw new AppError('Choose an original PDF or DOCX file up to 10 MB.');
  return saveCvArtifact({ dataDir: store.dataDir, bytes: Buffer.from(req.body.contentBase64, 'base64'), filename: req.body.filename });
}));
app.post('/api/cv/file/prepare', wrap(req => {
  const { runId, companyId, purpose } = req.body || {};
  if (purpose !== 'cv_upload') throw new AppError('Prepare a CV file only for an authorized CV-upload step.');
  const run = store.getRun(runId);
  if (run.native) store.getNativeClaim({ runId, companyId, assistant: req.body.assistant, claimToken: req.body.claimToken });
  if (run.explicit !== true || run.mode !== 'send_and_submit' || run.status !== 'running' || Date.parse(run.expiresAt) <= Date.now() || !run.companyIds.includes(companyId) || (run.managed && run.activeCompanyId !== companyId)) throw new AppError('Use the current company in an active explicitly authorized run.');
  assertRunPurpose(run, purpose);
  return stageCvArtifact({ dataDir: store.dataDir, runId, companyId });
}));
app.get('/api/calendar/calendars', wrap(async () => (await localAdapters()).calendar('listCalendars')));
app.post('/api/calendar/events', wrap(async req => (await localAdapters()).calendar('listEvents', req.body)));
app.post('/api/calendar/event', wrap(async req => (await localAdapters()).calendar('createEvent', req.body)));
app.get(
  "/api/bootstrap",
  wrap(async () => ({
    directories: store.listDirectories(),
    settings: store.getSettings(),
    connections: nativeMode() ? [] : (await localAdapters()).connections.list(),
    nativeClient: nativeMode() ? store.getNativeClientStatus() : null,
    statuses: STATUSES,
    runs: store.runSummaries(),
    reports: store.listReports().slice(0, 5),
  })),
);
app.get(
  "/api/background",
  wrap(() => backgroundStatus({ dataDir: store.dataDir, port })),
);
app.post(
  "/api/background/install",
  wrap(() => installBackground({ dataDir: store.dataDir, port })),
);
app.delete(
  "/api/background/install",
  wrap(() => uninstallBackground({ dataDir: store.dataDir, port })),
);
app.get(
  "/api/companies",
  wrap((req) => {
    const input = { ...req.query };
    for (const key of ['companyTypes', 'locations']) {
      if (input[key] === undefined) continue;
      try {
        if (typeof input[key] !== 'string') throw new Error();
        input[key] = JSON.parse(input[key]);
        if (!Array.isArray(input[key])) throw new Error();
      } catch { throw new AppError(`${key} must be a JSON array.`); }
    }
    const result = store.listCompanies(input);
    if (req.query.summary === 'true') return { ...result, items: result.items.map(({ sourceFields, ...company }) => company) };
    return result;
  }),
);
app.post(
  "/api/directories",
  wrap((req) => store.createDirectory(req.body)),
);
app.patch(
  "/api/directories/:id",
  wrap((req) => store.updateDirectory(req.params.id, req.body)),
);
app.post(
  "/api/directories/:id/companies",
  wrap((req) => store.addCompanies(req.params.id, req.body.records)),
);
app.post(
  "/api/import/preview",
  wrap(async (req) => {
    const { filename, content } = req.body;
    return await parseDirectory({
      filename,
      content: Buffer.from(content, "base64"),
    });
  }),
);
app.get(
  "/api/companies/:id",
  wrap((req) => ({
    company: store.getCompany(req.params.id),
    applications: store.listApplications(req.params.id),
    activity: store.listActivity({ companyId: req.params.id }),
  })),
);
app.patch(
  "/api/companies/:id",
  wrap((req) => store.updateCompany(req.params.id, req.body)),
);
app.post(
  "/api/applications",
  wrap((req) => store.logApplication(req.body)),
);
app.post(
  "/api/runs",
  wrap((req) => nativeMode() ? nativeRun(req.body).run : store.startRun(req.body)),
);
app.get('/api/assistants', wrap(() => agentRunner.assistants()));
app.post('/api/run-preview', wrap(req => store.previewRun(req.body)));
app.post('/api/run', wrap(req => nativeMode() ? nativeRun(req.body) : agentRunner.start(req.body)));
app.post('/api/runs/:id/stop', wrap(req => stopRun(req.params.id)));
app.get(
  "/api/runs/:id",
  wrap((req) => runView(req.params.id)),
);
app.patch(
  "/api/runs/:id",
  wrap((req) => req.body.status === 'cancelled' ? stopRun(req.params.id) : (store.getRun(req.params.id).managed || store.getRun(req.params.id).native) ? Promise.reject(new AppError('The queue owns progress. Use Stop to stop it.')) : store.updateRun(req.params.id, req.body)),
);
app.get(
  "/api/settings",
  wrap(() => store.getSettings()),
);
app.patch(
  "/api/settings",
  wrap(async req => {
    const before = nativeMode(), settings = store.updateSettings(req.body);
    await adapterOwner.modeChanged(before);
    return settings;
  }),
);
app.get(
  "/api/activity",
  wrap((req) => store.listActivity(req.query)),
);
app.get(
  "/api/reports",
  wrap(() => store.listReports()),
);
app.get('/api/snapshot', wrap(req => store.snapshot(req.query)));
app.post(
  "/api/reports",
  wrap(() => nativeMode() ? store.saveReport(store.report()) : scheduler.generateReport()),
);
app.post(
  "/api/refresh",
  wrap(() => scheduler.refresh()),
);
app.get(
  "/api/connections",
  wrap(() => nativeMode() ? [] : connections.list()),
);
app.put(
  "/api/connections/:kind",
  wrap((req) => connections.save(req.params.kind, req.body)),
);
app.post(
  "/api/connections/:kind/connect",
  wrap((req) => connections.connect(req.params.kind)),
);
app.delete(
  "/api/connections/:kind",
  wrap((req) => connections.disconnect(req.params.kind)),
);
app.get(
  "/api/connections/:kind/tools",
  wrap((req) => connections.tools(req.params.kind)),
);
app.get("/api/connections/:kind/oauth/callback", async (req, res) => {
  try {
    await connections.oauthCallback(req.params.kind, req.query);
    res.redirect("/?connected=" + encodeURIComponent(req.params.kind));
  } catch (error) {
    res
      .status(400)
      .type("text")
      .send(
        `Connection could not finish: ${error.message}. Return to the tracker and try connecting again.`,
      );
  }
});
app.post(
  "/api/cv/read",
  wrap(async () => (await localAdapters()).readCv()),
);
app.post('/api/applications/:id/reconcile-email', wrap(async req => (await localAdapters()).reconcileEmail(req.params.id)));
app.get(
  "/api/cv",
  wrap(() => {
    if (nativeMode()) throw new AppError('Read the actual CV through your Codex or Claude Code connection. Tawdheef does not cache the native CV.');
    const p = resolve(store.dataDir, "cv-cache.json");
    return existsSync(p)
      ? JSON.parse(readFileSync(p, "utf8"))
      : { fetchedAt: null, result: null };
  }),
);
// A mapped outbound call is tied to one explicit run and one recorded target.
app.post(
  "/api/runs/:id/send-email",
  wrap(async (req) => {
    return (await localAdapters()).sendEmail(req.params.id, req.body);
  }),
);
app.get(
  "/api/export/:id",
  wrap((req, res) => {
    const fields = [
      "name",
      "status",
      "nextAction",
      "lastUpdate",
      "careersUrl",
      "website",
      "linkedinUrl",
      "applyUrl",
      "email",
      "sector",
      "location",
      "sourceRole",
      "routeStatus",
      "checkedAt",
      "sourceId",
      "followUpAt",
      "notes",
    ];
    const esc = (value) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const csv = [
      fields.map(esc).join(","),
      ...store
        .exportCompanies(req.params.id)
        .map((c) =>
          fields
            .map((k) =>
              esc(/^[=+@\-]/.test(String(c[k] ?? "")) ? "'" + c[k] : c[k]),
            )
            .join(","),
        ),
    ].join("\r\n");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="directory.csv"',
    );
    res.type("text/csv").send("\uFEFF" + csv);
  }),
);
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(express.static(resolve(ROOT, 'public'), { dotfiles: 'deny' }));
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve(ROOT, "dist")));
  // Source checkouts can preview the separately built website. It is not copied
  // into the working app or its desktop package.
  if (existsSync(resolve(ROOT, 'public/welcome/index.html'))) app.use(express.static(resolve(ROOT, 'public'), { dotfiles: 'deny' }));
  else app.get(['/welcome', '/welcome/*path', '/guides/*path', '/skills', '/skills/*path', '/examples', '/examples/*path', '/ar/guides/*path', '/ar/skills', '/ar/skills/*path', '/ar/examples', '/ar/examples/*path'], (req, res) => res.redirect(302, `https://www.tawdheef.com${req.path.replace(/^\/welcome(?=\/|$)/, '') || '/'}`));
  app.get(/^(?!\/api\/).*/, (_, res) =>
    res.sendFile(resolve(ROOT, "dist/index.html")),
  );
}
app.use((req, res) =>
  res.status(404).json({ error: "This action was not found." }),
);
app.use((error, req, res, next) => {
  res.status(error.status || 400).json({
    error: String(error.message || "This action could not finish.").slice(
      0,
      600,
    ),
  });
});
store.recoverNativeRuns();
if (!nativeMode()) await localAdapters();
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Apply Tracker is running locally at ${baseUrl}`);
});
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  store.recoverNativeRuns();
  await adapterOwner.close();
  await new Promise((resolve) => server.close(resolve));
  store.close();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
