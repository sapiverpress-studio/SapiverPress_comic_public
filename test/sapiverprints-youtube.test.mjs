import test from 'node:test';
import assert from 'node:assert/strict';
import { publishYouTube } from '../scripts/sapiverprints-youtube.mjs';

const id='abcdefghijk';
const job={title:'Neo-Deco Jazz',description:'Jazz posters',link:'https://sapiverprints.etsy.com'};
function fixture(data,reportError=false){
 const calls=[],receipts=[],logs=[];
 return {calls,receipts,logs,options:{token:'test-token',log:s=>logs.push(s),
  ownerReport:async (...args)=>{if(reportError)throw Error('Receipt rejected');receipts.push(args);},
  request:async (url,options)=>{
   calls.push({url,options});
   if(calls.length===1)return new Response(null,{status:200,headers:{location:'https://www.googleapis.com/upload/session'}});
   if(calls.length===2)return Response.json(data);
   throw Error('Upload-only credential must not make a videos.list request');
  }
 }};
}
for(const uploadStatus of ['uploaded','processed'])test('accept public '+uploadStatus+' without read scope',async()=>{
 const f=fixture({id,status:{privacyStatus:'public',uploadStatus}});
 assert.equal(await publishYouTube(Buffer.from('video'),job,f.options),id);
 assert.equal(f.calls.length,2);
 assert.deepEqual(f.receipts,[['youtube',id]]);
 const meta=JSON.parse(f.calls[0].options.body);
 assert.equal(meta.status.privacyStatus,'public');
 assert.ok(meta.snippet.description.includes(job.link));
});
for(const status of [{privacyStatus:'private',uploadStatus:'uploaded'},{privacyStatus:'unlisted',uploadStatus:'uploaded'},undefined,{privacyStatus:'public',uploadStatus:'rejected'},{privacyStatus:'public'}])test('reject unconfirmed status '+JSON.stringify(status),async()=>{
 const f=fixture({id,status});
 await assert.rejects(publishYouTube(Buffer.from('video'),job,f.options));
 assert.deepEqual(f.receipts,[]);
 assert.ok(f.logs[0].includes(id));
});
test('missing video ID is never reported',async()=>{
 const f=fixture({status:{privacyStatus:'public',uploadStatus:'uploaded'}});
 await assert.rejects(publishYouTube(Buffer.from('video'),job,f.options),/video ID/);
 assert.deepEqual(f.receipts,[]);
});
test('receipt failure retains ID and does not upload again',async()=>{
 const f=fixture({id,status:{privacyStatus:'public',uploadStatus:'uploaded'}},true);
 await assert.rejects(publishYouTube(Buffer.from('video'),job,f.options),/Receipt rejected/);
 assert.equal(f.calls.length,2);
 assert.ok(f.logs[0].includes(id));
});
