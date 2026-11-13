import express from "express";
import { resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { openStore, ROOT, STATUSES, AppError } from "./store.mjs";
import { parseDirectory } from "./import.mjs";
import { ConnectionManager } from "./connections.mjs";
import { createScheduler } from "./scheduler.mjs";
import {
  backgroundStatus,
  installBackground,
  uninstallBackground,
} from "../scripts/background.mjs";
import { sendEmailForRun, reconcileApplicationEmail } from "./email-send.mjs";
import { readConnectedCv } from "./cv-read.mjs";
import { createClientConfig, integrationStatus, integrationPresets } from './integrations.mjs';
import { calendarAction } from './calendar.mjs';
import { createAgentRunner, checkAssistantAuthentication } from './agent-runner.mjs';
import { createSetupStatus } from './setup-status.mjs';

const port = Number(process.env.APPLY_TRACKER_PORT || 4000);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Choose a port between 1024 and 65535.");
const baseUrl = `http://127.0.0.1:${port}`;
const store = openStore();
const connections = new ConnectionManager({ dataDir: store.dataDir, baseUrl });
const setupStatus = createSetupStatus({ store, connections, port });
const scheduler = createScheduler({ store, connections, baseUrl });
const agentRunner = createAgentRunner({ store, port, checkReady: async executable => {
  await checkAssistantAuthentication(executable);
  try { await readConnectedCv({ store, connections }); }
  catch { throw new AppError('Connect your Tabbio CV in Connections and check that it can be read, then press Run.'); }
} });
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
    const config = await createClientConfig({ dataDir: store.dataDir, port, include });
    return { mcpServers: config.mcpServers };
  }),
);
app.get('/api/integrations', wrap(() => integrationStatus({ dataDir: store.dataDir, port })));
app.get('/api/integrations/presets', wrap(() => integrationPresets({ dataDir: store.dataDir, port })));
app.get('/api/setup-status', wrap(req => setupStatus(req.query.assistant ? { assistant: req.query.assistant } : {})));
app.post('/api/setup-status/check', wrap(req => setupStatus({ ...req.body, verify: true })));
app.get('/api/calendar/calendars', wrap(() => calendarAction(connections, 'listCalendars')));
app.post('/api/calendar/events', wrap(req => calendarAction(connections, 'listEvents', req.body)));
app.post('/api/calendar/event', wrap(req => calendarAction(connections, 'createEvent', req.body)));
app.get(
  "/api/bootstrap",
  wrap(() => ({
    directories: store.listDirectories(),
    settings: store.getSettings(),
    connections: connections.list(),
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
    const result = store.listCompanies(req.query);
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
  wrap((req) => store.startRun(req.body)),
);
app.get('/api/assistants', wrap(() => agentRunner.assistants()));
app.post('/api/run-preview', wrap(req => agentRunner.preview(req.body)));
app.post('/api/run', wrap(req => agentRunner.start(req.body)));
app.post('/api/runs/:id/stop', wrap(req => agentRunner.stop(req.params.id)));
app.get(
  "/api/runs/:id",
  wrap((req) => store.getRun(req.params.id)),
);
app.patch(
  "/api/runs/:id",
  wrap((req) => req.body.status === 'cancelled' ? agentRunner.stop(req.params.id) : store.getRun(req.params.id).managed ? Promise.reject(new AppError('The queue owns progress. Use Stop to stop it.')) : store.updateRun(req.params.id, req.body)),
);
app.get(
  "/api/settings",
  wrap(() => store.getSettings()),
);
app.patch(
  "/api/settings",
  wrap((req) => store.updateSettings(req.body)),
);
app.get(
  "/api/activity",
  wrap((req) => store.listActivity(req.query)),
);
app.get(
  "/api/reports",
  wrap(() => store.listReports()),
);
app.post(
  "/api/reports",
  wrap(() => scheduler.generateReport()),
);
app.post(
  "/api/refresh",
  wrap(() => scheduler.refresh()),
);
app.get(
  "/api/connections",
  wrap(() => connections.list()),
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
  wrap(() => readConnectedCv({ store, connections })),
);
app.post('/api/applications/:id/reconcile-email', wrap(req => reconcileApplicationEmail({ store, connections, applicationId: req.params.id })));
app.get(
  "/api/cv",
  wrap(() => {
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
    return sendEmailForRun({
      store,
      connections,
      runId: req.params.id,
      input: req.body,
    });
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
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve(ROOT, "dist")));
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
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Apply Tracker is running locally at ${baseUrl}`);
  scheduler.start();
});
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await agentRunner.close();
  await scheduler.stop();
  await new Promise((resolve) => server.close(resolve));
  await connections.close();
  store.close();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
