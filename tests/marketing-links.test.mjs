import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installMarketingRedirects, localMarketingUrl } from '../server/marketing-links.mjs';

test('packaged website links preserve locale, query and canonical setup routes', async t => {
  const app = express();
  installMarketingRedirects(app, { websiteAvailable: false });
  app.use((_req, res) => res.status(418).send('tracker untouched'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const cases = {
    '/welcome/': '/', '/welcome/ar/': '/ar/', '/ar/': '/ar/',
    '/skills': '/skills/', '/ar/skills/': '/ar/skills/',
    '/guides/': '/guides/', '/ar/guides/connect-your-cv/': '/ar/guides/connect-your-cv/',
    '/guides/use-the-skill/?from=app': '/guides/use-the-skill/?from=app',
    '/get-started': '/guides/use-the-skill/',
    '/skills/tawdheef/': '/guides/use-the-skill/',
    '/ar/get-started/': '/ar/guides/use-the-skill/',
    '/ar/guides/get-started/?from=app': '/ar/guides/use-the-skill/?from=app',
    '/ar/skills/tawdheef': '/ar/guides/use-the-skill/',
  };
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, target] of Object.entries(cases)) {
    const response = await fetch(base+path, { redirect: 'manual' });
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.get('location'), 'http://127.0.0.1:4001'+target, path);
  }
  for (const path of ['/', '/api/health', '/skills-extra', '/arbitrary']) {
    assert.equal((await fetch(base+path, { redirect: 'manual' })).status, 418, path);
  }
  assert.throws(() => localMarketingUrl('/api/health'));
  assert.equal(new URL(localMarketingUrl('/welcome/ar/')+'#cv').hash, '#cv');
});

test('source website previews and writes are not redirected', async t => {
  const app = express();
  installMarketingRedirects(app, { websiteAvailable: true });
  app.use((_req, res) => res.send('local source preview'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal(await (await fetch(`http://127.0.0.1:${server.address().port}/skills/`)).text(), 'local source preview');
});
