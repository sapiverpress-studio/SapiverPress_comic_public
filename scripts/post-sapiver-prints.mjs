// Sapiver Prints → Pinterest. Uses only publicly published Etsy products.
// No Etsy secrets and no interaction with the Sapiver Forge daily/social publisher.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FEED_URL='https://raw.githubusercontent.com/sapiverpress-studio/SapiverForge/main/data/etsy-public-catalog.json';
export const BOARD_NAME='Sapiver Prints';
export const STATE_PATH='social/sapiver-prints/pinterest-receipts.json';
const API='https://api.pinterest.com/v5';
const MAX_AGE=5.5*60*60*1000;
const IMAGE_DOMAIN=/^https:\/\/[^/]+\.etsystatic\.com\//i;

export function validateFeed(feed,now=Date.now()) {
  if(feed?.schemaVersion!==1||feed.shop!=='SapiverPrints'||!Array.isArray(feed.items)||feed.items.length>1000)throw Error('Unexpected Etsy shop/feed');
  const date=Date.parse(feed.generatedAt);
  if(!Number.isFinite(date)||now-date< -300000||now-date>=MAX_AGE)throw Error('Public Etsy feed stale or future-dated');
  const seen=new Set();
  const items=feed.items.map(item=>{
    const id=Number(item.id);
    if(!Number.isSafeInteger(id)||id<=0||seen.has(id))throw Error('Invalid or duplicate Etsy ID');
    seen.add(id);
    const link='https://www.etsy.com/listing/'+id;
    if(item.url!==link||!IMAGE_DOMAIN.test(String(item.image||'')))throw Error('Unsafe Etsy link or image');
    if(typeof item.title!=='string'||!item.title.trim()||item.title.length>220||
       typeof item.description!=='string'||item.description.length>190||
       typeof item.imageAlt!=='string'||item.imageAlt.length>220)throw Error('Invalid Etsy listing metadata');
    return {id,title:item.title.trim(),description:item.description,image:item.image,imageAlt:item.imageAlt,url:link};
  });
  return {generatedAt:feed.generatedAt,items};
}

export function pinPayload(item,boardId){
  const title=item.title.split(/\s+[—–|]\s+/)[0].trim().slice(0,100)||item.title.slice(0,100);
  const description=[item.description.trim(), 'Discover this Sapiver Prints artwork on Etsy.'].filter(Boolean).join('\n\n').slice(0,480);
  return {
    board_id:boardId,title,description,link:item.url,
    alt_text:(item.imageAlt || item.title).slice(0,500),
    media_source:{source_type:'image_url',url:item.image,is_standard:true}
  };
}

export function pendingItems(items,receipts,remotePins){
  const posted=receipts?.byListingId || {};
  return items.filter(item => !posted[String(item.id)] && !remotePins.has(item.url));
}

async function apiFetch(fetchImpl,route,token,options={}){
  const response=await fetchImpl(API+route,{
    ...options,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})},
    signal:AbortSignal.timeout(20000)
  });
  if(!response.ok){
    // Never echo Pinterest's error bodies (potentially contain sensitive tokens).
    throw Error('Pinterest API '+options.method+' '+route.split('?')[0]+' HTTP '+response.status);
  }
  return response.json();
}

export async function pinterestToken(fetchImpl,env) {
  const refresh=env.PINTEREST_REFRESH_TOKEN||'';
  const clientId=env.PINTEREST_CLIENT_ID||env.PINTEREST_APP_ID||'';
  const clientSecret=env.PINTEREST_CLIENT_SECRET||env.PINTEREST_APP_SECRET||'';
  const rotatedOut=env.PINTEREST_REFRESH_TOKEN_OUT||'';
  if(!refresh||!clientId||!clientSecret||!rotatedOut)throw Error('Missing Pinterest refresh credentials or safe rotation path');
  if(!env.GH_TOKEN)throw Error('GitHub secret rotation authority missing; will not refresh Pinterest token');
  const basic=Buffer.from(clientId+':'+clientSecret).toString('base64');
  const response=await fetchImpl(API+'/oauth/token',{
    method:'POST',headers:{Authorization:'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh}),
    signal:AbortSignal.timeout(20000)
  });
  if(!response.ok)throw Error('Pinterest token refresh HTTP '+response.status);
  const data=await response.json();
  if(!data.access_token||!/^pinr/.test(data.refresh_token||''))throw Error('Missing continuous Pinterest refresh token; not posting');
  await fs.writeFile(rotatedOut,data.refresh_token+'\n',{mode:0o600});
  return data.access_token;
}

export async function boardForPrints(fetchImpl,token){
  let bookmark='',all=[];
  for(let page=0;page<20;page++){
    const qs=new URLSearchParams({page_size:'100'});
    if(bookmark)qs.set('bookmark',bookmark);
    const batch=await apiFetch(fetchImpl,'/boards?'+qs,token);
    if(!Array.isArray(batch.items))throw Error('Invalid Pinterest boards response');
    all.push(...batch.items);
    bookmark=batch.bookmark||'';
    if(!bookmark)break;
    if(page===19)throw Error('Pinterest board listing is incomplete');
  }
  const existing=all.filter(board=>String(board.name||'').trim().toLowerCase()===BOARD_NAME.toLowerCase());
  if(existing.length>1)throw Error('Multiple Sapiver Prints Pinterest boards; resolve before posting');
  if(existing[0]){
    if(!existing[0].id)throw Error('Existing Pinterest board missing ID');
    return {id:String(existing[0].id),name:BOARD_NAME};
  }
  const created=await apiFetch(fetchImpl,'/boards',token,{
    method:'POST',body:JSON.stringify({name:BOARD_NAME,description:'Original Sapiver Prints wall art, nursery pictures, music posters and illustrated collections.'})
  });
  if(!created?.id || String(created.name||'').toLowerCase()!==BOARD_NAME.toLowerCase())throw Error('Pinterest did not confirm dedicated Sapiver Prints board');
  return {id:String(created.id),name:BOARD_NAME};
}

async function boardPinMap(fetchImpl,token,boardId) {
  const remote=new Map();
  let bookmark='';
  for(let page=0;page<20;page++){
    const qs=new URLSearchParams({page_size:'100'});
    if(bookmark)qs.set('bookmark',bookmark);
    const data=await apiFetch(fetchImpl,'/boards/'+boardId+'/pins?'+qs,token);
    if(!Array.isArray(data.items))throw Error('Pinterest board Pins response is incomplete');
    for(const pin of data.items){
      const match=/^https:\/\/www\.etsy\.com\/listing\/([1-9]\d*)(?:[/?#].*)?$/.exec(String(pin.link||''));
      if(match&&pin.id)remote.set('https://www.etsy.com/listing/'+match[1],String(pin.id));
    }
    bookmark=data.bookmark||'';
    if(!bookmark)return remote;
  }
  throw Error('Pinterest Pin scan exceeded 2000 entries; refusing to risk duplicates');
}

async function readReceipts(file) {
  try{
    const parsed=JSON.parse(await fs.readFile(file,'utf8'));
    if(parsed.schemaVersion!==1||parsed.boardName!==BOARD_NAME||
      !parsed.byListingId||typeof parsed.byListingId!=='object')throw Error('Unexpected existing receipt schema');
    return parsed;
  }catch(error) {
    if(error.code==='ENOENT')return {schemaVersion:1,boardName:BOARD_NAME,byListingId:{}};
    throw error;
  }
}

export async function runPublisher({fetchImpl=fetch,env=process.env,now=Date.now(),stateFile=STATE_PATH,maxNewPins=1,interPinDelayMs=maxNewPins>2?30000:0,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  if(!Number.isInteger(maxNewPins)||maxNewPins<0||maxNewPins>25)throw Error('Unexpected per-run Pin limit');
  if(!Number.isInteger(interPinDelayMs)||interPinDelayMs<0||interPinDelayMs>120000)throw Error('Invalid Pinterest batch spacing');
  const response=await fetchImpl(FEED_URL,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('Public Etsy catalogue fetch HTTP '+response.status);
  const feed=validateFeed(await response.json(),now);
  const state=await readReceipts(stateFile);
  const next=feed.items.filter(item=>!state.byListingId[String(item.id)]);
  if(!next.length)return {status:'up_to_date',pending:0,created:0,found:0};
  // Preflight via GitHub only; permissions and tokens are not passed to Netlify.
  const token=await pinterestToken(fetchImpl,env);
  const board=await boardForPrints(fetchImpl,token);
  const remote=await boardPinMap(fetchImpl,token,board.id);
  let created=0,found=0;
  // Record existing Pins when the previous run published but failed to persist its receipt.
  for(const item of next){
    const existingId=remote.get(item.url);
    if(!existingId)continue;
    state.byListingId[String(item.id)]={
      pinId:existingId,boardId:board.id,link:item.url,
      postedAt:new Date(now).toISOString(),origin:'already_on_pinterest'
    };
    found++;
  }
  const pending=pendingItems(feed.items,state,remote);
  for(const item of pending.slice(0,maxNewPins)){
    // Batch backlogs gradually; individual Pins have no duplicated listing destinations.
    if(created>0 && interPinDelayMs>0)await sleep(interPinDelayMs);
    const payload=pinPayload(item,board.id);
    const made=await apiFetch(fetchImpl,'/pins',token,{method:'POST',body:JSON.stringify(payload)});
    if(!made?.id|| (made.board_id&&String(made.board_id)!==board.id))throw Error('Pinterest did not verify Pin and board; no success receipt written');
    if(made.link && !made.link.startsWith(item.url))throw Error('Pinterest returned unexpected click destination');
    state.byListingId[String(item.id)]={
      pinId:String(made.id),boardId:board.id,link:item.url,
      postedAt:new Date(now).toISOString(),origin:'created'
    };
    await fs.mkdir(path.dirname(stateFile),{recursive:true});
    await fs.writeFile(stateFile,JSON.stringify(state,null,2)+'\n');
    created++;
    console.log('Created Sapiver Prints Pin '+made.id+' for Etsy listing '+item.id);
  }
  if(found>0){
    await fs.mkdir(path.dirname(stateFile),{recursive:true});
    await fs.writeFile(stateFile,JSON.stringify(state,null,2)+'\n');
  }
  return {status:'ok',boardId:board.id,created,found,pending:Math.max(0,pending.length-created)};
}

if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const max=Number(process.env.SAPIVER_PRINTS_MAX_PINS||'1');
  runPublisher({maxNewPins:max}).then(result=>console.log('Sapiver Prints Pinterest result: '+JSON.stringify(result)))
    .catch(error=>{console.error('Sapiver Prints Pinterest failed: '+String(error.message||error).slice(0,300));process.exitCode=1});
}
