import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integrationStatus, createClientConfig, exportClientConfig } from '../server/integrations.mjs';
async function fixture(t) { const root=await mkdtemp(join(tmpdir(),'tawdheef-native-config-')); t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5})); const dataDir=join(root,'private data'); await mkdir(dataDir); return {root,dataDir,port:4018}; }
test('client config contains only the tracker and explicitly selected direct Tabbio',async t=>{
  const options=await fixture(t), baseline=await createClientConfig(options);
  assert.deepEqual(baseline.included,['apply-tracker']); assert.equal(baseline.mcpServers['apply-tracker'].env.APPLY_TRACKER_DATA,options.dataDir);
  assert.equal(JSON.parse(baseline.claudeJson).mcpServers['apply-tracker'].type,'stdio');
  for(const include of [['playwright'],['outlook-mcp'],['google-cli']]) await assert.rejects(createClientConfig({...options,include}),/actual client/);
  await assert.rejects(createClientConfig({...options,mode:'local-adapters'}),/retired/);
  const direct=await createClientConfig({...options,include:['tabbio']}); assert.equal(direct.mcpServers.tabbio.url,'https://server.tabbio.com/api/mcp');
  const output=join(options.root,'exported'), result=await exportClientConfig(output,options), original=await readFile(result.files[0],'utf8');
  await assert.rejects(exportClientConfig(output,options),/already exists/); assert.equal(await readFile(result.files[0],'utf8'),original);
});
test('readiness ignores and preserves historical private provider credentials',async t=>{
  const options=await fixture(t), path=join(options.dataDir,'connections.private.json'), privateBytes='{"email":{"auth":{"refreshToken":"fixture-secret"}}}'; await writeFile(path,privateBytes);
  const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/api/health'?{ok:true,app:'apply-tracker'}:{mcpServers:{'apply-tracker':{env:{APPLY_TRACKER_DATA:join(options.root,'someone-else')}}}}));});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok)); t.after(()=>new Promise(ok=>server.close(ok)));
  const status=await integrationStatus({...options,mode:'local-adapters',port:server.address().port});
  assert.equal(status.mode,'native'); assert.equal(status.app.running,true); assert.equal(status.app.sameDataDirectory,false); assert.deepEqual(status.integrations,[]); assert.equal(status.accountConnected,false);
  assert.ok(!JSON.stringify(status).includes('fixture-secret')); assert.equal(await readFile(path,'utf8'),privateBytes);
});
