import test from 'node:test';
import assert from 'node:assert/strict';
import {BICEP_PIN_BOARD,BICEP_PIN_UPDATES,updateBicepPinCopies} from '../scripts/update-bicep-heart-pin-copy.mjs';

function receipts(){
 return {schemaVersion:1,boardName:'Sapiver Prints',byListingId:Object.fromEntries(
  BICEP_PIN_UPDATES.map(x=>[x.listingId,{pinId:x.pinId,boardId:BICEP_PIN_BOARD,link:x.link}])
 )};
}
function adapter({wrongLink=false,unsupportedPatch=false,wrongBoard=false}={}){
 const pins=new Map(BICEP_PIN_UPDATES.map(x=>[x.pinId,{
  id:x.pinId,board_id:wrongBoard?'WRONG':BICEP_PIN_BOARD,
  link:wrongLink?'https://www.etsy.com/listing/1':x.link,
  title:'Original Etsy-derived title',description:'Original Etsy-derived excerpt',alt_text:'Old alt text',
  is_owner:true
 }]));
 const requests=[];
 async function fetchImpl(url,opts){
  const id=/\/pins\/(\d+)/.exec(url)?.[1],method=opts.method;requests.push({method,id,url});
  if(!id||!pins.has(id)||!url.startsWith('https://api.pinterest.com/v5/pins/'))throw Error('Unexpected endpoint');
  if(method==='PATCH'){
   if(unsupportedPatch)return Response.json({error:'not supported'},{status:403});
   Object.assign(pins.get(id),JSON.parse(opts.body));
  }
  return Response.json(structuredClone(pins.get(id)));
 }
 return {fetchImpl,pins,requests};
}
test('updates exactly the three confirmed existing Pins, with distinct titles and searchable copy',async()=>{
 const a=adapter(),state=receipts();
 const out=await updateBicepPinCopies({fetchImpl:a.fetchImpl,token:'pin-test',receipts:state});
 assert.equal(out.length,3);assert.ok(out.every(x=>x.verified&&x.updated));
 assert.deepEqual(a.requests.filter(x=>x.method==='PATCH').map(x=>x.id),BICEP_PIN_UPDATES.map(x=>x.pinId));
 assert.ok(a.requests.every(x=>['GET','PATCH'].includes(x.method)));
 for(const p of BICEP_PIN_UPDATES){
  const after=a.pins.get(p.pinId);assert.equal(after.board_id,BICEP_PIN_BOARD);
  assert.equal(after.link,p.link);assert.equal(after.description,p.description);assert.equal(after.alt_text,p.alt_text);
  assert.ok(p.description.includes('#'));
 }
 const second=await updateBicepPinCopies({fetchImpl:a.fetchImpl,token:'pin-test',receipts:state});
 assert.ok(second.every(x=>x.verified&&!x.updated));
 assert.equal(a.requests.filter(x=>x.method==='PATCH').length,3);
});
test('refuses stale receipts, wrong Etsy destinations and changed Pinterest board',async()=>{
 for(const mode of ['receipt','link','board']){
  const a=adapter({wrongLink:mode==='link',wrongBoard:mode==='board'}),state=receipts();
  if(mode==='receipt')state.byListingId[BICEP_PIN_UPDATES[0].listingId].pinId='WRONG';
  await assert.rejects(updateBicepPinCopies({fetchImpl:a.fetchImpl,token:'pin-test',receipts:state}));
  assert.equal(a.requests.filter(x=>x.method==='PATCH').length,0);
 }
});
test('unsupported PATCH stops safely without fabricating posted/updated receipts',async()=>{
 const a=adapter({unsupportedPatch:true});
 await assert.rejects(updateBicepPinCopies({fetchImpl:a.fetchImpl,token:'pin-test',receipts:receipts()}),/Pinterest PATCH returned HTTP 403/);
 assert.equal(a.requests.filter(x=>x.method==='PATCH').length,1);
 assert.equal(a.pins.get(BICEP_PIN_UPDATES[0].pinId).title,'Original Etsy-derived title');
});
