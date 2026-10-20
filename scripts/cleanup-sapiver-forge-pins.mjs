// One-off selective cleanup. Never delete boards or anything associated with Sapiver Prints.
// A reviewable read-only audit must be committed BEFORE delete mode is enabled.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {pinterestToken} from './post-sapiver-prints.mjs';
const BASE='https://api.pinterest.com/v5';
export const AUDIT='social/sapiver-forge/pin-cleanup-audit.json';
export const RESULT='social/sapiver-forge/pin-cleanup-result.json';
const ID=/^[0-9]{4,40}$/;
const norm=value=>String(value||'').trim();
const protectedName=/sapiver[\s_-]*prints\b|#sapiverprints\b/i;
const forgeName=/sapiver[\s_-]*forge\b|#sapiverforge\b|\bclearforge\b/i;
function protectedLink(link){
 const l=norm(link).toLowerCase();
 return /sapiverprints\.etsy\.com|(?:^|\/)etsy\.com\/listing\/[0-9]+/.test(l)||/sapiver[-_]?prints/.test(l);
}
export function classifyPin(pin,boardName,protectedIds=new Set()){
 const id=norm(pin?.id),board=norm(boardName),title=norm(pin?.title),description=norm(pin?.description),link=norm(pin?.link);
 if(!ID.test(id))return {action:'skip',reason:'invalid_pin_id'};
 if(protectedIds.has(id))return {action:'protect',reason:'sapiver_prints_receipt'};
 if(/sapiver[\s_-]*prints/i.test(board)||protectedName.test(title+' '+description)||protectedLink(link))
   return {action:'protect',reason:'sapiver_prints_content'};
 if(pin.is_owner===false||pin.is_removable===false)return {action:'skip',reason:'not_removable'};
 if(/^sapiver\s+forge(?:$|\s|[—–-])/i.test(board))return {action:'candidate',reason:'sapiver_forge_board'};
 if(forgeName.test(title+' '+description))return {action:'candidate',reason:'sapiver_forge_label'};
 return {action:'skip',reason:'unrelated'};
}
export const auditSignature=items=>createHash('sha256').update(
 JSON.stringify(items.map(p=>({id:String(p.id),boardId:String(p.boardId)})).sort((a,b)=>a.id.localeCompare(b.id)))
).digest('hex');
async function api(fetchImpl,token,route,{method='GET'}={}){
 const res=await fetchImpl(BASE+route,{method,headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(method==='DELETE'){
  if(res.status===204)return {deleted:true};
  if(res.status===404)return {deleted:false,alreadyMissing:true};
  throw Error('Pinterest DELETE HTTP '+res.status+' (no further deletion)');
 }
 if(!res.ok)throw Error('Pinterest GET HTTP '+res.status+' for '+route.split('?')[0]);
 const data=await res.json();
 return data;
}
async function listPages(fetchImpl,token,endpoint,{pageSize=250,maxPages=40}={}){
 let bookmark='',list=[],seen=new Set();
 for(let n=0;n<maxPages;n++){
  const q=new URLSearchParams({page_size:String(pageSize)});
  if(bookmark)q.set('bookmark',bookmark);
  const data=await api(fetchImpl,token,endpoint+'?'+q);
  if(!Array.isArray(data.items))throw Error('Incomplete Pinterest API response for '+endpoint);
  list.push(...data.items);
  if(!data.bookmark)return list;
  if(seen.has(data.bookmark))throw Error('Repeated Pinterest pagination bookmark');
  seen.add(data.bookmark);bookmark=data.bookmark;
 }
 throw Error('Pinterest listing exceeded safety limit for '+endpoint);
}
export async function inventory({fetchImpl,token,protectedIds=new Set()}){
 const [boards,pins]=await Promise.all([
  listPages(fetchImpl,token,'/boards',{pageSize:100,maxPages:25}),
  listPages(fetchImpl,token,'/pins',{pageSize:250,maxPages:40})
 ]);
 const boardsById=new Map(boards.map(b=>[norm(b.id),norm(b.name)]));
 const candidates=[],protectedPins=[],unrelated=[];
 for(const p of pins){
  const boardName=boardsById.get(norm(p.board_id))||'';
  const verdict=classifyPin(p,boardName,protectedIds);
  const short={id:norm(p.id),boardId:norm(p.board_id),board:boardName,title:norm(p.title).slice(0,140),link:norm(p.link).slice(0,250),reason:verdict.reason};
  if(verdict.action==='candidate')candidates.push(short);
  else if(verdict.action==='protect')protectedPins.push(short);
  else unrelated.push(short);
 }
 if(new Set(candidates.map(p=>p.id)).size!==candidates.length)throw Error('Duplicate candidate IDs');
 candidates.sort((a,b)=>a.id.localeCompare(b.id));
 return {
  version:1,mode:'audit',checkedAt:new Date().toISOString(),boards:boards.map(b=>({id:norm(b.id),name:norm(b.name)})),
  counts:{all:pins.length,candidates:candidates.length,protected:protectedPins.length,other:unrelated.length},
  candidateSignature:auditSignature(candidates),candidates,
  protectedSamples:protectedPins.slice(0,6),
  otherSamples:unrelated.slice(0,6)
 };
}
export async function removeAudited({fetchImpl,token,audit,expectedSignature,protectedIds=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),onProgress=()=>{}}){
 if(audit?.mode!=='audit'||audit.version!==1||!Array.isArray(audit.candidates))throw Error('Missing immutable pin audit');
 if(!expectedSignature||auditSignature(audit.candidates)!==expectedSignature||audit.candidateSignature!==expectedSignature)
   throw Error('Audit signature not explicitly locked; DELETE denied');
 if(audit.candidates.length>400)throw Error('Delete threshold exceeded');
 const current=await inventory({fetchImpl,token,protectedIds});
 const now=new Map(current.candidates.map(x=>[x.id,x]));
 const deleted=[],absent=[];
 for(const audited of audit.candidates){
  if(!ID.test(audited.id)||protectedIds.has(audited.id))throw Error('Protected Pin in audit; stop');
  const live=now.get(audited.id);
  if(!live){absent.push(audited.id);continue;}
  if(live.boardId!==audited.boardId||live.reason!==audited.reason||
     classifyPin(live,live.board,protectedIds).action!=='candidate')
    throw Error('Pin classification changed; stop before DELETE');
  const answer=await api(fetchImpl,token,'/pins/'+audited.id,{method:'DELETE'});
  if(answer.deleted){deleted.push(audited.id);onProgress({deleted:audited.id,total:deleted.length});}
  else absent.push(audited.id);
  await sleep(700);
 }
 return {mode:'deleted',completedAt:new Date().toISOString(),lockedAuditSignature:expectedSignature,
  auditCount:audit.candidates.length,deletedIds:deleted,alreadyMissingIds:absent,
  preservedPrintsCount:current.counts.protected};
}
async function main(){
 const mode=process.env.PINTEREST_CLEANUP_MODE||'audit';
 if(!['audit','delete'].includes(mode))throw Error('Unsafe cleanup mode');
 const rotation=process.env.PINTEREST_REFRESH_TOKEN_OUT;
 if(!rotation)throw Error('Refresh token persistence unavailable');
 const receipts=JSON.parse(await fs.readFile('social/sapiver-prints/pinterest-receipts.json','utf8'));
 const protectedIds=new Set(Object.values(receipts.byListingId||{}).map(p=>norm(p.pinId)));
 if(protectedIds.size<30)throw Error('Expected existing Sapiver Prints Pin protection is missing');
 const token=await pinterestToken(fetch,{...process.env,GH_TOKEN:process.env.GH_TOKEN});
 if(mode==='audit'){
  const scan=await inventory({fetchImpl:fetch,token,protectedIds});
  await fs.mkdir(path.dirname(AUDIT),{recursive:true});
  await fs.writeFile(AUDIT,JSON.stringify(scan,null,2)+'\n');
  console.log('Forge cleanup AUDIT boards: '+JSON.stringify(scan.boards));
  console.log('Forge cleanup AUDIT counts: '+JSON.stringify(scan.counts));
  console.log('Forge cleanup candidates (IDs, board, short title, link): '+JSON.stringify(scan.candidates));
  console.log('Forge cleanup signature: '+scan.candidateSignature);
  return;
 }
 const audit=JSON.parse(await fs.readFile(AUDIT,'utf8'));
 const expected=process.env.PINTEREST_CLEANUP_AUDIT_HASH||'';
 const out=await removeAudited({fetchImpl:fetch,token,audit,expectedSignature:expected,protectedIds,
  onProgress:event=>console.log('Deleted identified Forge Pin '+event.deleted)});
 await fs.writeFile(RESULT,JSON.stringify(out,null,2)+'\n');
 console.log('Forge cleanup DELETE result: '+JSON.stringify({deleted:out.deletedIds.length,alreadyMissing:out.alreadyMissingIds.length,preservedPrints:out.preservedPrintsCount}));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
 main().catch(e=>{console.error('Forge cleanup stopped: '+String(e.message||e).slice(0,220));process.exitCode=1;});
