/** Build reviewed public packs without opening any tracker database. */
import { readFile, writeFile, mkdir, readdir, realpath, access } from 'node:fs/promises';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { parseDirectory } from '../../server/import.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PUBLIC_FIELDS = ['id','name','arabicName','sector','location','type','sourceRole','website','careersUrl','applyUrl','linkedinUrl','email','routeStatus','checkedAt'];
const COLUMNS = [['Record ID','id'],['Name','name'],['Arabic name','arabicName'],['Sector','sector'],['Location','location'],['Type','type'],['Source role','sourceRole'],['Website','website'],['Careers URL','careersUrl'],['Apply URL','applyUrl'],['LinkedIn URL','linkedinUrl'],['Email','email'],['Route status','routeStatus'],['Checked at','checkedAt'],['Original evidence JSON','sourceFields']];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = value => '"'+String(value??'').replaceAll('"','""')+'"';
const object = value => value!==null && typeof value==='object' && !Array.isArray(value);
const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;

async function publicRelease(root){
  const readOptional=async path=>{try{return JSON.parse(await readFile(join(root,path),'utf8'));}catch(error){if(error.code==='ENOENT')return{};throw error;}};
  const [config,pkg]=await Promise.all([readOptional('website/config.json'),readOptional('package.json')]);
  const repository=(config.intendedRepository||'https://github.com/ahmedaldhraif/tawdheef').replace(/\/$/,'');
  assert.match(repository,/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,'Use the actual public GitHub repository URL');
  const releaseTag=config.releaseTag||(typeof pkg.version==='string'&&/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(pkg.version)?`v${pkg.version}`:null);
  const releaseUrl=releaseTag?`${repository}/releases/tag/${encodeURIComponent(releaseTag)}`:`${repository}/releases`;
  const assetBase=releaseTag?`${repository}/releases/download/${encodeURIComponent(releaseTag)}`:null;
  const rawBase=repository.replace('https://github.com/','https://raw.githubusercontent.com/')+'/main/';
  return{repository,releaseTag,releaseUrl,assetBase,rawBase};
}

async function sourcePath(root, source) {
  assert.equal(typeof source,'string','pack.source must name a reviewed public JSON file');
  assert.ok(!isAbsolute(source)&&!source.includes('\\'),'pack.source must be repository-relative, using / separators');
  const path=resolve(root,source), rel=relative(root,path).replaceAll('\\','/');
  assert.ok(!rel.startsWith('../')&&!isAbsolute(rel),'pack.source must stay inside the repository');
  assert.ok(/^(data|directories|research)\//.test(rel),'pack.source must be under data/, directories/ or reviewed research/');
  assert.ok(!rel.split('/').some(part=>part.startsWith('.')||/^(node_modules|dist|outputs)$/i.test(part)),'Private or generated-output source paths are not allowed');
  assert.ok(rel.endsWith('.json'),'Pack input must be a public JSON snapshot');
  const canonical=await realpath(path),canonicalRoot=await realpath(root),actual=relative(canonicalRoot,canonical).replaceAll('\\','/');
  assert.ok(!actual.startsWith('../')&&!isAbsolute(actual)&&/^(data|directories|research)\//.test(actual)&&!actual.split('/').some(part=>part.startsWith('.')),'Public source symlinks must not resolve into private or external files');
  return canonical;
}

export function validateDefinition(def, folder) {
  assert.ok(object(def),'Pack definition must be an object');
  assert.match(def.id??'',/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Pack id must be a lowercase slug');
  if(folder)assert.equal(def.id,folder,'Pack id must match its directory');
  assert.ok(typeof def.name==='string'&&def.name.trim(),`${def.id}: name is required`);
  assert.match(def.country??'',/^[A-Z]{2}$/,`${def.id}: actual two-letter country code required`);
  assert.ok(dateValid(def.snapshotDate??''),`${def.id}: snapshotDate must be a real YYYY-MM-DD date`);
  assert.ok(['country','sector','regional'].includes(def.kind??'country'),`${def.id}: unsupported pack kind`);
  if(def.countries)assert.ok(Array.isArray(def.countries)&&def.countries.every(code=>/^[A-Z]{2}$/.test(code)),`${def.id}: countries must contain actual two-letter codes`);
  if(def.sourceSha256)assert.match(def.sourceSha256,/^[a-f0-9]{64}$/,`${def.id}: invalid pinned source SHA-256`);
  for(const field of['featured','historical'])if(def[field]!==undefined)assert.equal(typeof def[field],'boolean',`${def.id}: ${field} must be boolean`);
  return def;
}

export function validateSnapshot(snapshot, def) {
  assert.ok(object(snapshot)&&object(snapshot.source)&&Array.isArray(snapshot.records),`${def.id}: source metadata and records are required`);
  assert.ok(snapshot.records.length>0,`${def.id}: an empty template is not a publishable pack`);
  if(snapshot.source.snapshotDate)assert.equal(snapshot.source.snapshotDate,def.snapshotDate,`${def.id}: snapshot dates differ`);
  if(snapshot.source.recordCount!==undefined)assert.equal(snapshot.source.recordCount,snapshot.records.length,`${def.id}: recordCount differs from records`);
  const ids=new Set();
  for(const record of snapshot.records){
    assert.ok(object(record),`${def.id}: every record must be an object`);
    for(const field of Object.keys(record))assert.ok(PUBLIC_FIELDS.includes(field)||field==='sourceFields',`${def.id}: unsupported record field ${field}; do not publish local tracking exports`);
    for(const field of PUBLIC_FIELDS)if(record[field]!==undefined)assert.equal(typeof record[field],'string',`${def.id}: ${record.id??'(missing id)'} ${field} must be a string`);
    for(const field of ['id','name','sourceRole','routeStatus'])assert.ok(record[field]?.trim(),`${def.id}: each record needs ${field}`);
    assert.ok(!ids.has(record.id),`${def.id}: duplicate stable source ID ${record.id}`);ids.add(record.id);
    assert.ok(object(record.sourceFields),`${def.id}: ${record.id} needs original sourceFields evidence`);
  }
  return snapshot;
}

export function csvParts(records,{maxBytes=19*1024*1024,maxRows=20_000}={}){
  const header='\uFEFF'+COLUMNS.map(([name])=>quote(name)).join(',')+'\r\n';
  const parts=[];let lines=[],bytes=Buffer.byteLength(header);
  for(const record of records){
    const line=COLUMNS.map(([,field])=>quote(field==='sourceFields'?JSON.stringify(record.sourceFields):record[field])).join(',')+'\r\n';
    const size=Buffer.byteLength(line);
    assert.ok(size<950_000,`${record.id}: one evidence row exceeds the import parser limit`);
    assert.ok(Buffer.byteLength(header)+size<=maxBytes,`${record.id}: row exceeds selected chunk size`);
    if(lines.length&&(bytes+size>maxBytes||lines.length>=maxRows)){parts.push(header+lines.join(''));lines=[];bytes=Buffer.byteLength(header);}
    lines.push(line);bytes+=size;
  }
  if(lines.length)parts.push(header+lines.join(''));return parts;
}

async function preparePack(root,def,release){
  validateDefinition(def);const original=await readFile(await sourcePath(root,def.source)),digest=hash(original);
  if(def.sourceSha256)assert.equal(digest,def.sourceSha256,`${def.id}: pinned public source changed; review it instead of silently rebuilding`);
  const snapshot=validateSnapshot(JSON.parse(original),def),parts=csvParts(snapshot.records);
  const imports=parts.map((_,index)=>`${def.id}-directory${parts.length>1?`-${String(index+1).padStart(2,'0')}`:''}.csv`);
  let index=0;const warnings=[],importNormalizations=[];
  for(let part=0;part<parts.length;part++){
    const parsed=await parseDirectory({filename:imports[part],content:parts[part]});warnings.push(...parsed.warnings);
    for(const imported of parsed.records){
      const source=snapshot.records[index++];assert.ok(source,`${def.id}: import unexpectedly added a record`);
      for(const field of PUBLIC_FIELDS){
        const expected=source[field]??'';
        if(imported[field]!==expected && !['id','website','careersUrl','applyUrl','linkedinUrl'].includes(field) && imported[field]===expected.trim()){
          importNormalizations.push({sourceId:source.id,field,operation:'Importer trims surrounding whitespace; unchanged original retained in JSON'});
        }else assert.equal(imported[field],expected,`${def.id}: ${source.id} ${field} changed during import`);
      }
      assert.deepEqual(JSON.parse(imported.sourceFields['Original evidence JSON']),source.sourceFields,`${def.id}: ${source.id} original evidence changed`);
    }
  }
  assert.equal(index,snapshot.records.length,`${def.id}: import lost records`);
  const roles={};for(const record of snapshot.records)roles[record.sourceRole]=(roles[record.sourceRole]??0)+1;
  const files={original:`${def.id}-directory.json`,import:imports[0],imports,index:'index.json',readme:'README.md'};
  const notes=[...(def.notes??[]),'Research snapshot, not a current vacancy feed','A portal, agency or programme is not automatically an employer','Published routes may be untested; inclusion does not establish hiring, eligibility, mailbox deliverability or permission to automate','Full original public evidence is retained byte-for-byte in JSON and as Original evidence JSON in CSV','No private tracking or application activity included'];
  const manifest={id:def.id,name:def.name,country:def.country,countries:def.countries??[def.country],kind:def.kind??'country',description:def.description??'',featured:def.featured!==false,historical:def.historical===true,snapshotDate:def.snapshotDate,recordCount:snapshot.records.length,formatVersion:1,source:def.source,sourceSha256:digest,sourceRoleCounts:roles,importNormalizations,credit:def.credit??'Initial research by Ahmed AlDhraif; open to community contributions',license:def.license??'Repository code is MIT licensed. Retained public source facts, third-party sites and marks keep their own terms; inspect original evidence.',files,notes};
  Object.assign(manifest,{releaseTag:release.releaseTag,releaseUrl:release.releaseUrl,...(release.assetBase?{downloadUrl:`${release.assetBase}/${def.id}-directory-pack.zip`}:{}),indexUrl:`${release.rawBase}directories/${def.id}/index.json`,sourceUrl:release.rawBase+def.source});
  const discovery={formatVersion:1,id:manifest.id,name:manifest.name,country:manifest.country,countries:manifest.countries,snapshotDate:manifest.snapshotDate,recordCount:manifest.recordCount,sourceSha256:digest,originalJSON:files.original,canonicalSource:def.source,provenance:{recordIdField:'id',fullEvidenceField:'sourceFields',instructions:'This is a compact research-source index, not a vacancy feed. Read canonicalSource in the repository or originalJSON in the downloaded pack; locate the same stable record id to inspect full evidence and missing-data notes.'},records:snapshot.records.map(record=>({id:record.id,name:record.name,sourceRole:record.sourceRole,sector:record.sector??'',location:record.location??'',...Object.fromEntries(['website','careersUrl','applyUrl','linkedinUrl','email','routeStatus','checkedAt'].filter(field=>record[field]).map(field=>[field,record[field]]))}))};
  assert.deepEqual(discovery.records.map(record=>record.id),snapshot.records.map(record=>record.id),`${def.id}: compact index lost or changed source IDs`);
  const indexText=JSON.stringify(discovery,null,2)+'\n';
  const readme=`${manifest.name} directory pack for Tawdheef\n\n${manifest.recordCount} organisation/source records; snapshot ${manifest.snapshotDate}.\n${manifest.credit}.\n\nDownload ZIP: ${manifest.downloadUrl||release.releaseUrl}\nExtract the ZIP on your computer before importing. CSV files are inside this download, not versioned GitHub CSV links.\n\nThe JSON is an unchanged public evidence snapshot. CSV imports retain stable source IDs, exact mapped URLs, source roles and full Original evidence JSON.\n\nImport files: ${imports.join(', ')}\n${imports.length>1?'Import every numbered part into the same selected directory; each chunk is below the local importer limit.\n':''}\nIn Tawdheef, create or select your directory tab, then use List options > Import list and review each CSV preview. CLI preview from the Tawdheef checkout, replacing both placeholders:\nnode bin/apply-tracker.mjs import --directory DIRECTORY_ID --file PATH_TO_EXTRACTED_PACK/${imports[0]}\n\nUse the real directory ID returned by the tracker. Add --commit only after reviewing the preview and authorising the import. Importing a pack does not apply to companies. Refreshing evidence must preserve existing tracking.\n\n${notes.map(note=>'- '+note).join('\n')}\n\nCorrections: submit the stable source ID, changed value, public evidence URL and date. Maintainers update the reviewed public source/new dated snapshot and rebuild; generated CSV is not the durable editing source. Never edit data/uae-directory.json or the original UAE pack.\n`;
  const readmeMarkdown=`# ${manifest.name} directory pack\n\n**${manifest.recordCount.toLocaleString('en-US')} organisation/source records** · Research snapshot: **${manifest.snapshotDate}**\n\n[Download ZIP](${manifest.downloadUrl||release.releaseUrl}) · [Release](${manifest.releaseUrl}) · [Tawdheef app](${release.repository})\n\n${manifest.description||'A researched directory add-on for Tawdheef, the Auto Job Apply & Application Tracker.'}\n\n## Add this pack to Tawdheef\n\n1. [Set up the app](${release.repository}/blob/main/docs/FIRST-RUN.md) if it is not running yet. A directory pack ZIP is an add-on, not the app installer.\n2. Download the ZIP above and **extract it locally**. The CSV imports are inside the ZIP; they are not files to fetch from Git.\n3. Create or select the country tab in Tawdheef, then open **List options → Import list**.\n4. Preview and import ${imports.length>1?'every numbered CSV part into that same tab':'the CSV into that tab'}: ${imports.map(file=>'`'+file+'`').join(', ')}. Review warnings before committing.\n\nFor an agent, read the extracted \`manifest.json\` → \`files.imports\` and use the local directory ID returned by \`list_directories\`. A pack ID is not a local directory ID. Importing a pack never starts applications.\n\n## Read with an agent\n\n- [Compact index](index.json): every stable record ID and primary facts.\n- [Full evidence](${manifest.sourceUrl}): match the same \`id\` and inspect \`sourceFields\`.\n- [Manifest](manifest.json): source integrity and import filenames.\n- Source SHA-256: \`${manifest.sourceSha256}\`. Hash the full source file bytes.\n\nThe index is for discovery, not an import file or a substitute for provenance. The ZIP retains the full original JSON as \`${files.original}\`.\n\n## Correct a record or add another country\n\n[Report a correction](${release.repository}/issues/new?template=directory-data.yml), [propose a pack](${release.repository}/issues/new?template=new-country-pack.yml), or follow the [contribution guide](${release.repository}/blob/main/docs/DIRECTORY-CONTRIBUTING.md). **Any country or industry is welcome.** Keep stable IDs and include public evidence URLs and dates. Edit reviewed source data; generated downloads are rebuilt.\n\n${manifest.credit}.\n\n## Scope and reuse\n\n${notes.map(note=>'- '+note).join('\n')}\n\n${manifest.license}\n`;
  const manifestText=JSON.stringify(manifest,null,2)+'\n',zip=new JSZip();zip.file(files.original,original);parts.forEach((part,i)=>zip.file(imports[i],part));zip.file(files.index,indexText);zip.file('manifest.json',manifestText);zip.file('README.txt',readme);zip.file(files.readme,readmeMarkdown);
  return{def,manifest,original,parts,imports,readme,readmeMarkdown,manifestText,indexText,archive:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),warnings};
}

export async function discoverDefinitions(root=ROOT){
  const definitions=[];
  for(const entry of await readdir(join(root,'directories'),{withFileTypes:true})){
    if(!entry.isDirectory()||entry.name.startsWith('_')||entry.name.startsWith('.'))continue;
    let text;try{text=await readFile(join(root,'directories',entry.name,'pack.json'),'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
    definitions.push(validateDefinition(JSON.parse(text),entry.name));
  }
  return definitions.sort((a,b)=>a.id.localeCompare(b.id));
}

export async function buildDirectoryPacks({root=ROOT,pack,check=false}={}){
  const definitions=await discoverDefinitions(root);assert.ok(definitions.length,'No reviewed directories/<id>/pack.json definitions found');
  if(pack)assert.ok(definitions.some(def=>def.id===pack),`Unknown pack: ${pack}`);
  // Validate the whole catalog before writing; a failing new pack cannot erase others.
  const release=await publicRelease(root),prepared=[];for(const def of definitions)prepared.push(await preparePack(root,def,release));
  const catalog={version:1,repository:release.repository,releaseTag:release.releaseTag,releaseUrl:release.releaseUrl,packs:prepared.map(({manifest:m,def})=>({id:m.id,name:m.name,country:m.country,countries:m.countries,kind:m.kind,description:m.description,featured:m.featured,historical:m.historical,snapshotDate:m.snapshotDate,recordCount:m.recordCount,path:`${m.id}/manifest.json`,download:`${m.id}/${m.id}-directory-pack.zip`,downloadUrl:m.downloadUrl,indexUrl:m.indexUrl,sourceUrl:m.sourceUrl,source:m.source,sourceSha256:m.sourceSha256,sourceRoleCounts:m.sourceRoleCounts,files:m.files,credit:m.credit,...(def.overlaps?{overlaps:def.overlaps}:{})}))};
  if(!check){
    if(pack)for(const item of prepared){
      if(item.def.id===pack)continue;
      try{
        const folder=join(root,'directories',item.def.id),existing=JSON.parse(await readFile(join(folder,'manifest.json'),'utf8'));
        assert.equal(existing.sourceSha256,item.manifest.sourceSha256);
        assert.equal(existing.releaseTag,item.manifest.releaseTag);
        for(const name of[item.manifest.files.original,item.manifest.files.index,item.manifest.files.readme,...item.imports,`${item.def.id}-directory-pack.zip`])await access(join(folder,name));
      }catch{throw new Error(`${item.def.id}: another pack is missing or stale; run the full build before a targeted --pack build`);}
    }
    for(const item of prepared){
      if(pack&&item.def.id!==pack)continue;const out=join(root,'directories',item.def.id);await mkdir(out,{recursive:true});
      await writeFile(join(out,item.manifest.files.original),item.original);
      await writeFile(join(out,item.manifest.files.index),item.indexText);
      for(let i=0;i<item.parts.length;i++)await writeFile(join(out,item.imports[i]),item.parts[i]);
      await writeFile(join(out,'manifest.json'),item.manifestText);await writeFile(join(out,'README.txt'),item.readme);await writeFile(join(out,item.manifest.files.readme),item.readmeMarkdown);await writeFile(join(out,`${item.def.id}-directory-pack.zip`),item.archive);
    }
    await writeFile(join(root,'directories/catalog.json'),JSON.stringify(catalog,null,2)+'\n');
  }
  return{check,packs:prepared.filter(item=>!pack||item.def.id===pack).map(({manifest:m,parts,warnings})=>({id:m.id,records:m.recordCount,sourceSha256:m.sourceSha256,importParts:parts.length,csvRoundTrip:'Stable IDs, exact mapped URLs and full original evidence match; importer display-whitespace trims are audited',importNormalizations:m.importNormalizations.length,warnings})),catalog};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);let pack;for(let i=0;i<args.length;i++)if(args[i]==='--pack'){pack=args[++i];assert.ok(pack,'--pack needs an id');}else assert.equal(args[i],'--check',`Unknown argument: ${args[i]}`);
  try{const result=await buildDirectoryPacks({pack,check:args.includes('--check')});console.log(JSON.stringify({check:result.check,packs:result.packs,catalogPath:'directories/catalog.json',catalogPacks:result.catalog.packs.length,featuredRecords:result.catalog.packs.filter(item=>item.featured).reduce((sum,item)=>sum+item.recordCount,0)},null,2));}catch(error){console.error(`Directory pack build failed: ${error.message}`);process.exitCode=1;}
}
