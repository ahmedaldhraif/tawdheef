import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { parseDirectory } from '../server/import.mjs';
import { buildDirectoryPacks, csvParts, validateSnapshot } from '../scripts/marketing/build-directory-pack.mjs';
import { projectRecord } from '../scripts/marketing/project-reviewed-gcc-packs.mjs';

const record=id=>({id,name:'Fixture organisation · جهة تجريبية',sourceRole:'Unresolved source lead',routeStatus:'Recruitment route unknown',website:'https://example.org/?source=a&lang=ar',sourceFields:{evidenceUrls:['https://example.org/path?a=1&b=2'],missingDataNotes:['Email unknown'],original:'A quoted "value"\nand another line',nested:{'Source hyperlinks':{Careers:'https://example.org/jobs'}}}});

async function fixture(t){const root=await mkdtemp(join(tmpdir(),'tawdheef-packs-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function addPack(root,id,records){
  const path=join(root,'directories',id);await mkdir(path,{recursive:true});
  const def={id,name:'Fixture pack',country:'ZA',snapshotDate:'2026-11-13',source:`directories/${id}/source.json`};
  const source=JSON.stringify({source:{snapshotDate:'2026-11-13',recordCount:records.length},records},null,2)+'\n';
  await writeFile(join(path,'pack.json'),JSON.stringify(def));await writeFile(join(path,'source.json'),source);return{def,source,path};
}

test('multi-pack check is read-only; build conserves original bytes and full CSV evidence',async t=>{
  const root=await fixture(t),a=await addPack(root,'alpha',[record('stable-a')]),b=await addPack(root,'beta',[record('stable-b')]);
  await mkdir(join(root,'directories/_template'));await writeFile(join(root,'directories/_template/pack.json'),'{}');
  const checked=await buildDirectoryPacks({root,check:true});assert.deepEqual(checked.catalog.packs.map(pack=>pack.id),['alpha','beta']);
  await assert.rejects(readFile(join(root,'directories/catalog.json')),{code:'ENOENT'});
  await buildDirectoryPacks({root});
  for(const pack of[a,b]){
    assert.equal(await readFile(join(pack.path,`${pack.def.id}-directory.json`),'utf8'),pack.source);
    const zip=await JSZip.loadAsync(await readFile(join(pack.path,`${pack.def.id}-directory-pack.zip`)));
    assert.equal(await zip.file(`${pack.def.id}-directory.json`).async('string'),pack.source);
    const fullSource=JSON.parse(pack.source),discovery=JSON.parse(await readFile(join(pack.path,'index.json'),'utf8'));
    assert.equal(await zip.file('index.json').async('string'),await readFile(join(pack.path,'index.json'),'utf8'));
    assert.deepEqual(discovery.records.map(row=>row.id),fullSource.records.map(row=>row.id));
    assert.equal(discovery.recordCount,fullSource.records.length);
    assert.equal(discovery.sourceSha256,createHash('sha256').update(pack.source).digest('hex'));
    assert.equal(discovery.originalJSON,`${pack.def.id}-directory.json`);
    assert.equal(discovery.canonicalSource,pack.def.source);
    assert.equal(discovery.provenance.fullEvidenceField,'sourceFields');
    assert.equal(discovery.records[0].website,fullSource.records[0].website);
    assert.equal('sourceFields' in discovery.records[0],false);
    assert.equal('email' in discovery.records[0],false,'Unknown contacts were invented in discovery index');
    const parsed=await parseDirectory({filename:'pack.csv',content:await zip.file(`${pack.def.id}-directory.csv`).async('string')});
    assert.equal(parsed.records[0].id,`stable-${pack.def.id==='alpha'?'a':'b'}`);
    assert.deepEqual(JSON.parse(parsed.records[0].sourceFields['Original evidence JSON']),record('unused').sourceFields);
  }
});

test('invalid new pack cannot overwrite an existing catalog or expose tracking fields',async t=>{
  const root=await fixture(t);await addPack(root,'alpha',[record('stable-a')]);await buildDirectoryPacks({root});
  const original=await readFile(join(root,'directories/catalog.json'),'utf8');
  await addPack(root,'beta',[{...record('stable-b'),notes:'PRIVATE TRACKING FIXTURE'}]);
  await assert.rejects(buildDirectoryPacks({root}),/unsupported record field notes/);
  assert.equal(await readFile(join(root,'directories/catalog.json'),'utf8'),original);
  const source={source:{},records:[record('same'),record('same')]};assert.throws(()=>validateSnapshot(source,{id:'fixture'}),/duplicate stable source ID/);
});

test('CSV chunking retains every record in order within import bounds',async()=>{
  const rows=[record('a'),record('b'),record('c')],parts=csvParts(rows,{maxRows:1,maxBytes:4096});assert.equal(parts.length,3);
  const ids=[];for(const part of parts){assert.ok(Buffer.byteLength(part)<=4096);const parsed=await parseDirectory({filename:'part.csv',content:part});ids.push(...parsed.records.map(row=>row.id));}
  assert.deepEqual(ids,['a','b','c']);
});

test('targeted builds cannot publish a catalog pointing to unbuilt packs',async t=>{
  const root=await fixture(t);await addPack(root,'alpha',[record('a')]);await buildDirectoryPacks({root});
  const catalog=await readFile(join(root,'directories/catalog.json'),'utf8');await addPack(root,'beta',[record('b')]);
  await assert.rejects(buildDirectoryPacks({root,pack:'alpha'}),/full build before a targeted/);
  assert.equal(await readFile(join(root,'directories/catalog.json'),'utf8'),catalog);
});

test('public projection drops local activity and narrowly redacts crawler authentication state',()=>{
  const original={...record('local-id'),sourceId:'stable-id',directoryId:'private-directory',status:'applied',notes:'private tracking',sourceFields:{finalUrl:'https://sso.federalerp.gov.ae/federalsso/federalsso/ssologin?password=fixture&username=fixture',nested:{challenge:'https://www.energyjobline.com/botchallenge.html?token=fixture&return=%2Fjobs',magrabi:'https://www.magrabi.com/ae-en/?sessionInfoM=fixture&lang=en',jobs:'https://onegcc.com/jobs?_token=fixture&page=2'},businessEvidence:'https://hr@jgis-sa.com/careers'}};
  const projected=projectRecord(original);assert.equal(projected.id,'stable-id');for(const key of['sourceId','directoryId','status','notes'])assert.equal(key in projected,false);
  assert.equal(projected.sourceFields.finalUrl,'https://sso.federalerp.gov.ae/federalsso/federalsso/ssologin');
  assert.equal(new URL(projected.sourceFields.nested.challenge).searchParams.get('return'),'/jobs');assert.equal(new URL(projected.sourceFields.nested.challenge).searchParams.has('token'),false);
  assert.equal(new URL(projected.sourceFields.nested.magrabi).searchParams.get('lang'),'en');assert.equal(new URL(projected.sourceFields.nested.jobs).searchParams.get('page'),'2');
  assert.equal(projected.sourceFields.businessEvidence,original.sourceFields.businessEvidence);assert.equal(projected.sourceFields.publicationRedactions.length,4);
  assert.ok(original.sourceFields.finalUrl.includes('password=fixture'),'Original source was mutated');
  assert.throws(()=>projectRecord({...original,sourceFields:{url:'https://user:fixture@example.org/'}}),/Credential-bearing URL/);
});
