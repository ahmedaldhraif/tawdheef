/** One-time projection of the reviewed GCC research union into public sources.
 * Existing canonical sources are never replaced without --replace. Later
 * contributions belong in those reviewed sources, not in generated imports.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { PUBLIC_FIELDS, validateSnapshot } from './build-directory-pack.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const RESEARCH='research/gcc-expansion-2026-11-13';
const COUNTRIES=[['uae','uae-expanded','United Arab Emirates','AE',3583],['saudi','saudi-arabia','Saudi Arabia','SA',4256],['qatar','qatar','Qatar','QA',671],['oman','oman','Oman','OM',2587],['kuwait','kuwait','Kuwait','KW',1806],['bahrain','bahrain','Bahrain','BH',811]];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/** Remove only ephemeral retrieval state identified in the privacy review. */
export function publicEvidence(value,path='',redactions=[]){
  if(Array.isArray(value))return value.map((item,index)=>publicEvidence(item,`${path}[${index}]`,redactions));
  if(object(value))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicEvidence(item,path?`${path}.${key}`:key,redactions)]));
  if(typeof value==='string'){
    try{
      const url=new URL(value);
      if(url.hostname==='sso.federalerp.gov.ae'&&url.pathname.toLowerCase()==='/federalsso/federalsso/ssologin'&&url.search){
        url.search='';redactions.push({path,reason:'Anonymous authentication redirect query omitted from public export'});return url.href;
      }
      const parameter=url.hostname==='www.energyjobline.com'&&url.pathname==='/botchallenge.html'?'token':url.hostname==='www.magrabi.com'&&url.pathname==='/ae-en/'?'sessionInfoM':url.hostname==='onegcc.com'&&url.pathname==='/jobs'?'_token':null;
      if(parameter&&url.searchParams.has(parameter)){
        url.searchParams.delete(parameter);redactions.push({path,reason:'Ephemeral crawler challenge or session query value omitted from public export',parameter});return url.href;
      }
      assert.ok(!url.password,`Credential-bearing URL in public research at ${path}`);
    }catch(error){if(error.code==='ERR_ASSERTION')throw error;}
  }
  return value;
}

export function projectRecord(record){
  assert.ok(typeof record.sourceId==='string'&&record.sourceId.trim(),'Reviewed research record needs sourceId');
  const result=Object.fromEntries(PUBLIC_FIELDS.map(field=>[field,field==='id'?record.sourceId:(record[field]??'')]));
  const redactions=[];result.sourceFields=publicEvidence(record.sourceFields,'sourceFields',redactions);
  if(redactions.length)result.sourceFields.publicationRedactions=[...(result.sourceFields.publicationRedactions??[]),...redactions];
  return result;
}

export async function projectReviewedGccPacks({root=ROOT,write=false,replace=false}={}){
  const auditBytes=await readFile(join(root,RESEARCH,'import-plan/audit.json'));
  const audit=JSON.parse(auditBytes),prepared=[];
  for(const[key,id,name,country,expected]of COUNTRIES){
    const baselinePath=`${RESEARCH}/existing/${key}.json`,changesPath=`${RESEARCH}/import-plan/${key}.json`;
    const baselineBytes=await readFile(join(root,baselinePath)),changesBytes=await readFile(join(root,changesPath));
    const baseline=JSON.parse(baselineBytes),changes=JSON.parse(changesBytes),records=new Map();
    for(const record of baseline){assert.ok(!records.has(record.sourceId),`${id}: duplicate baseline sourceId`);records.set(record.sourceId,record);}
    for(const change of changes){assert.ok(change.record?.sourceId,`${id}: reviewed model lacks sourceId`);records.set(change.record.sourceId,change.record);}
    assert.equal(records.size,expected,`${id}: reviewed union count changed`);
    assert.equal(audit.summary[key].projectedRecords,expected,`${id}: audit count differs`);
    for(const original of baseline)assert.ok(records.has(original.sourceId),`${id}: baseline source ID lost`);
    const projected=[...records.values()].map(projectRecord);
    const redactionCount=projected.reduce((sum,record)=>sum+(record.sourceFields.publicationRedactions?.length??0),0);
    const source={source:{snapshotDate:'2026-11-13',recordCount:projected.length,credit:'Initial research by Ahmed AlDhraif; open to community contributions',methodology:'Reviewed country union: retain every baseline source ID, then replace or add each reviewed import-plan record by sourceId. No contactability filter or extra deduplication is applied. Only stable public source fields and all retained public evidence are projected; local tracking IDs and activity are excluded.',researchInputs:[{path:baselinePath,sha256:digest(baselineBytes)},{path:changesPath,sha256:digest(changesBytes)},{path:`${RESEARCH}/import-plan/audit.json`,sha256:digest(auditBytes)}],baselineRecords:baseline.length,reviewedChangeModels:changes.length,publicationRedactions:redactionCount,licenseNotes:'The project code license does not sublicense third-party websites, artwork or source content. Original evidence, source-specific license notes and rights remain attached to each record.'},records:projected};
    const def={id,name,country,kind:'country',featured:true,historical:false,snapshotDate:'2026-11-13',source:`directories/${id}/source.json`,description:`${projected.length.toLocaleString('en-US')} researched organisations and recruitment sources in ${name}, with original public evidence and missing-data notes.`,credit:source.source.credit,license:source.source.licenseNotes,notes:['Contains all reviewed source records, including unresolved roster-only leads. Published contacts and recruitment routes may be untested.',...(key==='uae'?['Separate expanded snapshot; overlaps the original 772-record UAE baseline. Do not add both pack counts as unique organisations.']:[])],...(key==='uae'?{overlaps:['uae']}:{})};
    validateSnapshot(source,def);prepared.push({id,source,def,redactionCount,sourcePath:join(root,def.source)});
  }
  assert.equal(prepared.reduce((sum,item)=>sum+item.source.records.length,0),13714,'Reviewed GCC union total changed');
  // Check every destination first: do not replace a maintainer's later corrections.
  if(write&&!replace)for(const item of prepared){let exists=true;try{await access(item.sourcePath);}catch(error){if(error.code==='ENOENT')exists=false;else throw error;}assert.ok(!exists,`${item.id}: canonical source already exists; review before explicitly using --replace`);}
  if(write)for(const item of prepared){await mkdir(dirname(item.sourcePath),{recursive:true});await writeFile(item.sourcePath,JSON.stringify(item.source,null,2)+'\n');await writeFile(join(dirname(item.sourcePath),'pack.json'),JSON.stringify(item.def,null,2)+'\n');}
  return{write,totalRecords:13714,packs:prepared.map(item=>({id:item.id,records:item.source.records.length,baselineRecords:item.source.source.baselineRecords,publicationRedactions:item.redactionCount,source:item.def.source}))};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);for(const arg of args)assert.ok(['--write','--replace','--check'].includes(arg),`Unknown argument: ${arg}`);
  try{console.log(JSON.stringify(await projectReviewedGccPacks({write:args.includes('--write'),replace:args.includes('--replace')}),null,2));}catch(error){console.error(`Public source projection failed: ${error.message}`);process.exitCode=1;}
}
