// One-off Pinterest board cleanup. Fixed ID + name allowlist, with three protected boards.
// No board creation, no Pins posted, no Etsy/PrintShrimp/video changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pinterestToken} from './post-sapiver-prints.mjs';
const API='https://api.pinterest.com/v5';
const KEEP=Object.freeze({
 '1038924276479981121':'Sapiver Prints',
 '1038924276479876865':'Sapiver Press Publishing',
 '1038924276479983705':'Social'
});
const REMOVE=Object.freeze({
 '1038924276479911800':'a.i news feed',
 '1038924276479841292':'AntiKing Sudoku',
 '1038924276479929523':'Clearforge',
 '1038924276479851513':'Facebook puzzles',
 '1038924276479879508':'Isla_Comic',
 '1038924276479869758':'Printable Sudoku Puzzles',
 '1038924276479851509':'Projects to try',
 '1038924276479849275':'Quick saves',
 '1038924276479840944':'Sudoku Books by Sapiver Press'
});
const OUTPUT='social/sapiver-forge/board-cleanup-results.json';
async function request(fetchImpl,token,route,method='GET'){
 const response=await fetchImpl(API+route,{method,headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(method==='DELETE'){if(response.status!==204)throw Error('Pinterest board removal did not return HTTP 204: '+response.status);return null;}
 if(!response.ok)throw Error('Pinterest GET failed: '+response.status);
 return response.json();
}
async function list(fetchImpl,token,route){
 let bookmark='',items=[],visited=new Set();
 for(let n=0;n<25;n++){
  const params=new URLSearchParams({page_size:'100'});
  if(bookmark)params.set('bookmark',bookmark);
  const value=await request(fetchImpl,token,route+'?'+params);
  if(!Array.isArray(value.items))throw Error('Incomplete provider list');
  items.push(...value.items);
  if(!value.bookmark)return items;
  if(visited.has(value.bookmark))throw Error('Repeated pagination');
  bookmark=value.bookmark;visited.add(bookmark);
 }
 throw Error('Pagination limit reached');
}
export function classifyBoards(boards){
 const named=new Map();
 for(const b of boards){
  const id=String(b.id||''),name=String(b.name||'');
  if(named.has(id))throw Error('Duplicate board ID');
  named.set(id,name);
  const expected=KEEP[id]||REMOVE[id];
  if(!expected||name!==expected)throw Error('Unknown or renamed Pinterest board: stop');
  if(b.is_owner===false)throw Error('Board not owned by this account');
 }
 for(const [id,name] of Object.entries(KEEP))if(named.get(id)!==name)throw Error('Protected Pinterest board missing or renamed: '+name);
 return Object.entries(REMOVE).filter(([id])=>named.has(id)).map(([id,name])=>({id,name}));
}
function protectedPin(pin,receipts){
 if(receipts.has(String(pin.id)))return true;
 const title=String(pin.title||''),desc=String(pin.description||''),url=String(pin.link||'');
 return /sapiver[\s_-]*prints\b/i.test(title+' '+desc+url)||
  /sapiverprints\.etsy\.com|etsy\.com\/listing\/[0-9]+/i.test(url);
}
export async function removeUnwantedBoards({fetchImpl,token,receipts,onProgress=async()=>{}}){
 const receiptsSet=new Set(Object.values(receipts.byListingId||{}).map(x=>String(x.pinId)));
 if(receiptsSet.size<32)throw Error('Sapiver Prints receipt protections incomplete');
 const first=await list(fetchImpl,token,'/boards');
 const targets=classifyBoards(first);
 const output={mode:'board_cleanup',startedAt:new Date().toISOString(),protectedBoardNames:Object.values(KEEP),
  removed:[],missingBefore:Object.keys(REMOVE).filter(id=>!targets.some(t=>t.id===id)),pinCountByBoard:{}};
 await onProgress(output);
 for(const {id,name} of targets){
  // Re-check all boards and the prospective board's Pins immediately before deletion.
  const current=await list(fetchImpl,token,'/boards');
  if(!classifyBoards(current).some(x=>x.id===id))throw Error('Board changed during cleanup');
  const pins=await list(fetchImpl,token,'/boards/'+id+'/pins');
  if(pins.some(p=>protectedPin(p,receiptsSet)))throw Error('Protected Sapiver Prints content detected: '+name);
  output.pinCountByBoard[id]=pins.length;
  await request(fetchImpl,token,'/boards/'+id,'DELETE');
  output.removed.push({id,name,pinsPreviouslySaved:pins.length});
  await onProgress(output);
 }
 const after=await list(fetchImpl,token,'/boards');
 const still=classifyBoards(after);
 if(still.length)throw Error('Unwanted boards remain after cleanup: '+still.length);
 output.complete=true;output.verifiedAt=new Date().toISOString();
 output.remainingBoards=after.map(x=>({id:x.id,name:x.name}));
 await onProgress(output);
 return output;
}
async function main(){
 if(process.env.PINTEREST_BOARD_CLEANUP_APPROVED!=='retain-three-delete-nine')
  throw Error('Protected-board cleanup approval gate absent');
 const receipts=JSON.parse(await fs.readFile('social/sapiver-prints/pinterest-receipts.json','utf8'));
 const token=await pinterestToken(fetch,{...process.env,GH_TOKEN:process.env.GH_TOKEN});
 await fs.mkdir(path.dirname(OUTPUT),{recursive:true});
 const done=await removeUnwantedBoards({fetchImpl:fetch,token,receipts,onProgress:async state=>{
  await fs.writeFile(OUTPUT,JSON.stringify(state,null,2)+'\n');
 }});
 console.log('Pinterest board cleanup verified: removed '+done.removed.length+', remaining protected '+done.remainingBoards.length);
}
if(process.argv[1]?.endsWith('remove-nine-pinterest-boards.mjs'))
 main().catch(e=>{console.error('Pinterest board cleanup stopped: '+String(e.message||e).slice(0,200));process.exitCode=1;});
