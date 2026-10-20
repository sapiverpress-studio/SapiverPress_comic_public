// Mock API regression suite; never calls Etsy, GitHub or Pinterest networks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FEED_URL,BOARD_NAME,validateFeed,pinPayload,runPublisher,feedUrlForEnv} from '../scripts/post-sapiver-prints.mjs';

const now=Date.parse('2026-10-16T12:00:00Z');
const item=(id,title='Velvet Echo — Jazz Singer and Vintage Microphone Art Print')=>({
  id,title,description:'A cosy original wall art poster for a jazz music room.',
  image:'https://i.etsystatic.com/12345678/r/il/abc.jpg',imageAlt:'Illustrated jazz singer',
  url:'https://www.etsy.com/listing/'+id
});
const feed=items=>({schemaVersion:1,shop:'SapiverPrints',generatedAt:new Date(now).toISOString(),items});
const env=output=>({
  PINTEREST_REFRESH_TOKEN:'pinr-original',PINTEREST_CLIENT_ID:'client-test',
  PINTEREST_CLIENT_SECRET:'secret-test',PINTEREST_REFRESH_TOKEN_OUT:output,
  GH_TOKEN:'mock-github-token'
});
function mockApi({products=[item(101),item(102)],pins=[],failPost=false,boardPresent=true}={}){
  const requests=[], created=[];
  return {
    requests,created,
    async fetch(url,opts={}){
      const address=String(url);requests.push({address,method:opts.method||'GET',body:opts.body});
      if(address===FEED_URL || /^https:\/\/raw\.githubusercontent\.com\/sapiverpress-studio\/SapiverForge\/[a-f0-9]{40}\/data\/etsy-public-catalogue\.json$/.test(address))return {ok:true,status:200,json:async()=>feed(products)};
      if(address.endsWith('/oauth/token'))return {ok:true,status:200,json:async()=>({access_token:'test-access',refresh_token:'pinr-next'})};
      if(address.includes('/boards?'))return {ok:true,status:200,json:async()=>({items:boardPresent?[{id:'555',name:BOARD_NAME}]:[],bookmark:null})};
      if(address.endsWith('/boards')&&opts.method==='POST')return {ok:true,status:201,json:async()=>({id:'555',name:BOARD_NAME})};
      if(address.includes('/boards/555/pins?'))return {ok:true,status:200,json:async()=>({items:pins,bookmark:null})};
      if(address.endsWith('/pins')&&opts.method==='POST'){
        if(failPost)return {ok:false,status:429,json:async()=>({error:'rate limit'})};
        const body=JSON.parse(opts.body);
        created.push(body);
        return {ok:true,status:201,json:async()=>({id:'987'+created.length,board_id:'555',link:body.link})};
      }
      throw Error('Unexpected test URL '+address);
    }
  };
}
test('validates exact published Etsy source, links, freshness and image domain',()=>{
 const items=[item(101)];
 assert.equal(validateFeed(feed(items),now).items.length,1);
 assert.throws(()=>validateFeed({...feed(items),shop:'SapiverPress'},now),/Unexpected/);
 assert.throws(()=>validateFeed(feed([item(101),item(101)]),now),/duplicate/);
 assert.throws(()=>validateFeed({...feed(items),generatedAt:new Date(now-6*3600000).toISOString()},now),/stale/);
 assert.throws(()=>validateFeed(feed([{...item(101),image:'https://evil.test/a.png'}]),now),/Unsafe/);
 assert.throws(()=>validateFeed(feed([{...item(101),url:'https://other.example'}]),now),/Unsafe/);
});
test('short Pinterest headline and canonical direct-to-Etsy destination',()=>{
 const p=pinPayload(item(101),'555');
 assert.equal(p.title,'Velvet Echo');
 assert.equal(p.board_id,'555');
 assert.equal(p.link,'https://www.etsy.com/listing/101');
 assert.equal(p.media_source.source_type,'image_url');
 assert.equal(p.media_source.url,item(101).image);
});
test('creates only one Pin, rotates token securely, saves receipt and avoids repost on retry',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sp-pin-'));
 try{
  const stateFile=path.join(tmp,'receipts.json'),out=path.join(tmp,'rotation');
  const mock=mockApi();
  const one=await runPublisher({fetchImpl:mock.fetch,env:env(out),now,stateFile});
  assert.equal(one.created,1);
  assert.equal(one.pending,1);
  assert.equal(mock.created.length,1);
  assert.equal(mock.created[0].link,'https://www.etsy.com/listing/101');
  assert.equal((await fs.readFile(out,'utf8')).trim(),'pinr-next');
  const receipts=JSON.parse(await fs.readFile(stateFile,'utf8'));
  assert.equal(receipts.byListingId['101'].pinId,'9871');
  const two=await runPublisher({fetchImpl:mock.fetch,env:env(out),now,stateFile});
  assert.equal(two.created,1);
  assert.equal(two.pending,0);
  const three=await runPublisher({fetchImpl:mock.fetch,env:{},now,stateFile});
  assert.equal(three.created,0);
  assert.equal(three.status,'up_to_date');
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('restores missing receipt from an existing remote Pinterest Pin instead of reposting it',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sp-pin-'));
 try{
  const mock=mockApi({products:[item(101)],pins:[{id:'existing-987',link:'https://www.etsy.com/listing/101'}]});
  const result=await runPublisher({fetchImpl:mock.fetch,env:env(path.join(tmp,'rotation')),now,stateFile:path.join(tmp,'state.json')});
  assert.equal(result.created,0);
  assert.equal(result.found,1);
  assert.equal(mock.created.length,0);
  const saved=JSON.parse(await fs.readFile(path.join(tmp,'state.json'),'utf8'));
  assert.equal(saved.byListingId['101'].pinId,'existing-987');
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('creates dedicated Prints board, never uses existing Sapiver Forge board',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sp-pin-'));
 try{
  const mock=mockApi({boardPresent:false,products:[item(101)]});
  const result=await runPublisher({fetchImpl:mock.fetch,env:env(path.join(tmp,'rotation')),now,stateFile:path.join(tmp,'state.json')});
  assert.equal(result.boardId,'555');
  const boardCall=mock.requests.find(r=>r.address.endsWith('/boards')&&r.method==='POST');
  assert.equal(JSON.parse(boardCall.body).name,BOARD_NAME);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('a Pinterest posting error does not create a false receipt',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sp-pin-'));
 try{
  const mock=mockApi({failPost:true,products:[item(101)]});
  const stateFile=path.join(tmp,'state.json');
  await assert.rejects(runPublisher({fetchImpl:mock.fetch,env:env(path.join(tmp,'rotation')),now,stateFile}),/429/);
  await assert.rejects(fs.readFile(stateFile,'utf8'),{code:'ENOENT'});
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});

test('backlog mode publishes all unpublished Etsy posters once, with spacing and persisted receipts',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sp-batch-'));
  try{
    const products=Array.from({length:20},(_,i)=>item(100+i));
    const stateFile=path.join(tmp,'state.json');
    await fs.writeFile(stateFile,JSON.stringify({schemaVersion:1,boardName:BOARD_NAME,byListingId:{
      '100':{pinId:'old-100',boardId:'555',link:'https://www.etsy.com/listing/100'},
      '101':{pinId:'old-101',boardId:'555',link:'https://www.etsy.com/listing/101'}
    }}));
    const mock=mockApi({products});
    const pauses=[];
    const result=await runPublisher({
      fetchImpl:mock.fetch,env:env(path.join(tmp,'rotation')),now,stateFile,
      maxNewPins:25,interPinDelayMs:30000,sleep:async ms=>{pauses.push(ms);}
    });
    assert.equal(result.created,18);
    assert.equal(result.pending,0);
    assert.equal(mock.created.length,18);
    assert.equal(new Set(mock.created.map(pin=>pin.link)).size,18);
    assert.equal(pauses.length,17);
    assert.ok(pauses.every(ms=>ms===30000));
    const saved=JSON.parse(await fs.readFile(stateFile,'utf8'));
    assert.equal(Object.keys(saved.byListingId).length,20);
    assert.deepEqual(mock.created.map(pin=>pin.link),products.slice(2).map(x=>x.url));
    const again=await runPublisher({fetchImpl:mock.fetch,env:{},now,stateFile,maxNewPins:25});
    assert.equal(again.status,'up_to_date');
    assert.equal(again.created,0);
  }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('backlog limit is bounded to 25 Pins per run',async()=>{
  await assert.rejects(runPublisher({maxNewPins:26}),/per-run Pin limit/);
});

test('paced batch reconciles six missing Pins from 32 Etsy listings without repinning existing products',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sp-all-etsy-'));
 try{
  const products=Array.from({length:32},(_,n)=>item(5000+n));
  const existing=Object.fromEntries(products.slice(0,26).map((x,n)=>[String(x.id),{pinId:String(10000+n),boardId:'555',link:x.url}]));
  const stateFile=path.join(tmp,'receipts.json');
  await fs.writeFile(stateFile,JSON.stringify({schemaVersion:1,boardName:BOARD_NAME,byListingId:existing}));
  const mock=mockApi({products});
  const pauses=[];
  const published=await runPublisher({fetchImpl:mock.fetch,env:env(path.join(tmp,'refresh')),now,stateFile,maxNewPins:20,sleep:async ms=>pauses.push(ms)});
  assert.equal(published.created,6);
  assert.equal(published.pending,0);
  assert.equal(pauses.length,5);
  assert.deepEqual(mock.created.map(p=>p.link),products.slice(26).map(p=>p.url));
  const receipts=JSON.parse(await fs.readFile(stateFile,'utf8'));
  assert.equal(Object.keys(receipts.byListingId).length,32);
  const repeat=await runPublisher({fetchImpl:mock.fetch,env:{},now,stateFile,maxNewPins:20});
  assert.equal(repeat.created,0);
  assert.equal(repeat.status,'up_to_date');
  assert.equal(mock.created.length,6);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('when more than 20 new listings await Pinterest, next run drains the remainder without duplicates',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sp-new-many-'));
 try{
  const products=Array.from({length:26},(_,n)=>item(7000+n));
  const stateFile=path.join(tmp,'state.json'),mock=mockApi({products});
  const first=await runPublisher({fetchImpl:mock.fetch,env:env(path.join(tmp,'refresh')),now,stateFile,maxNewPins:20,sleep:async()=>{}});
  assert.equal(first.created,20);
  assert.equal(first.pending,6);
  const second=await runPublisher({fetchImpl:mock.fetch,env:env(path.join(tmp,'refresh')),now,stateFile,maxNewPins:20,sleep:async()=>{}});
  assert.equal(second.created,6);
  assert.equal(second.pending,0);
  assert.equal(new Set(mock.created.map(x=>x.link)).size,26);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});

test('pinned Etsy catalogue commit is read instead of stale cached mutable main on new-listing dispatch',async()=>{
 const sha='a'.repeat(40);
 const pinned=feedUrlForEnv({SAPIVER_ETSY_FEED_SHA:sha});
 assert.equal(pinned,'https://raw.githubusercontent.com/sapiverpress-studio/SapiverForge/'+sha+'/data/etsy-public-catalog.json');
 assert.equal(feedUrlForEnv({}),FEED_URL);
 assert.throws(()=>feedUrlForEnv({SAPIVER_ETSY_FEED_SHA:'main'}),/Invalid pinned/);
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sp-pinned-feed-'));
 try{
  const mock=mockApi({products:[item(9501)]}),orig=mock.fetch;
  let used='';
  const wrapped=async(url,opts)=>{
    used=String(url);
    if(used===FEED_URL)return {ok:true,status:200,json:async()=>({...feed([item(9501)]),generatedAt:new Date(now-6*3600000).toISOString()})};
    return orig(url,opts);
  };
  const received=await runPublisher({fetchImpl:wrapped,env:{...env(path.join(tmp,'rotation')),SAPIVER_ETSY_FEED_SHA:sha},now,stateFile:path.join(tmp,'receipts.json')});
  assert.equal(received.created,1);
  assert.equal(received.pending,0);
  assert.ok(mock.created.length===1);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
