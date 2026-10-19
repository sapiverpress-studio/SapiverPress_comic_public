import test from 'node:test';
import assert from 'node:assert/strict';
import { publishPinterestVideo } from '../scripts/sapiverprints-pinterest-video.mjs';

const job={title:'Neo-Deco Jazz',description:'Jazz-inspired original prints',link:'https://sapiverprints.etsy.com'};
const video=Buffer.from('mp4-test');
function fixture({priorMediaId=null,statuses=['registered','processed','succeeded'],uploadStatus=204,failReceipt=false}={}){
 const calls=[],receipts=[],logs=[],pauses=[];
 let polls=0;
 const api=async(route,options={})=>{
  calls.push({route,method:options.method||'GET',body:options.body});
  if(route==='/media')return {media_id:'1234500',upload_url:'https://pinterest-media-upload.s3.amazonaws.com',upload_parameters:{policy:'safe'}};
  if(route==='/media/1234500')return {media_id:'1234500',status:statuses[Math.min(polls++,statuses.length-1)]};
  if(route==='/pins')return {id:'9876543210',board_id:'777',link:job.link};
  throw Error('Unexpected Pinterest route: '+route);
 };
 const request=async url=>{
  calls.push({upload:url});
  return new Response(null,{status:uploadStatus});
 };
 const ownerReport=async(platform,id)=>{
  if(failReceipt)throw Error('Private uploader checkpoint failed');
  receipts.push({platform,id});
 };
 return {calls,receipts,logs,pauses,api,request,ownerReport,
  options:{boardId:'777',pinterestApi:api,request,ownerReport,
   sleep:async ms=>pauses.push(ms),log:s=>logs.push(s),
   pollIntervalMs:1,pollLimit:5},job:{...job,...(priorMediaId?{pinterestMedia:{id:priorMediaId}}:{})}
 };
}
test('checkpoint uploaded media, wait for succeeded and delete only after Pin receipt',async()=>{
 const f=fixture();
 const id=await publishPinterestVideo(video,f.job,f.options);
 assert.equal(id,'9876543210');
 assert.equal(f.calls.filter(c=>c.route==='/media').length,1);
 assert.equal(f.calls.filter(c=>c.upload).length,1);
 assert.deepEqual(f.receipts,[{platform:'pinterest_media',id:'1234500'},{platform:'pinterest',id:'9876543210'}]);
 assert.equal(f.calls.filter(c=>c.route==='/pins').length,1);
 assert.equal(f.pauses.length,2);
 assert.ok(f.logs.some(x=>x.includes('processed')));
});
test('resume an already uploaded media ID without registering or uploading the MP4 again',async()=>{
 const f=fixture({priorMediaId:'1234500',statuses:['processed','succeeded']});
 await publishPinterestVideo(video,f.job,f.options);
 assert.equal(f.calls.some(c=>c.route==='/media'),false);
 assert.equal(f.calls.some(c=>c.upload),false);
 assert.deepEqual(f.receipts,[{platform:'pinterest',id:'9876543210'}]);
 assert.ok(f.logs.some(x=>x.includes('Resuming existing')));
});
test('processing timeout keeps media ID and never creates a Pin; later recovery resumes the same ID',async()=>{
 const f=fixture({statuses:['processed']});
 await assert.rejects(publishPinterestVideo(video,f.job,{...f.options,pollLimit:3}),/still processed/);
 assert.deepEqual(f.receipts,[{platform:'pinterest_media',id:'1234500'}]);
 assert.equal(f.calls.some(x=>x.route==='/pins'),false);
 const later=fixture({priorMediaId:'1234500',statuses:['processed','succeeded']});
 assert.equal(await publishPinterestVideo(video,later.job,later.options),'9876543210');
 assert.equal(later.calls.some(x=>x.route==='/media'||x.upload),false);
});
test('Pinterest failed processing is an explicit terminal error and never creates Pin',async()=>{
 const f=fixture({statuses:['failed']});
 await assert.rejects(publishPinterestVideo(video,f.job,f.options),/failed processing/);
 assert.equal(f.calls.some(x=>x.route==='/pins'),false);
 assert.deepEqual(f.receipts,[{platform:'pinterest_media',id:'1234500'}]);
});
test('unknown Pinterest media status fails visibly instead of silent repeated polling',async()=>{
 const f=fixture({statuses:['undocumented_state']});
 await assert.rejects(publishPinterestVideo(video,f.job,f.options),/unexpected status/);
 assert.equal(f.calls.some(x=>x.route==='/pins'),false);
});
test('private media checkpoint failure refuses to poll or create a Pin',async()=>{
 const f=fixture({failReceipt:true});
 await assert.rejects(publishPinterestVideo(video,f.job,f.options),/checkpoint failed/);
 assert.equal(f.calls.some(x=>x.route==='/pins'),false);
 assert.equal(f.calls.some(x=>x.route==='/media/1234500'),false);
 assert.ok(f.logs.some(x=>x.includes('Pinterest media transferred')));
});
test('invalid media ID cannot be used to resume or post',async()=>{
 const f=fixture({priorMediaId:'sneaky-id'});
 await assert.rejects(publishPinterestVideo(video,f.job,f.options),/Stored Pinterest media ID invalid/);
 assert.equal(f.calls.length,0);
});
test('no Pin creation when S3 has not acknowledged a 204 successful upload',async()=>{
 const f=fixture({uploadStatus:200});
 await assert.rejects(publishPinterestVideo(video,f.job,f.options),/not confirmed/);
 assert.equal(f.receipts.length,0);
 assert.equal(f.calls.some(x=>x.route==='/pins'),false);
});
test('persist failed receipt Pin ID in job logs for safe manual reconciliation',async()=>{
 const f=fixture({priorMediaId:'1234500',statuses:['succeeded'],failReceipt:true});
 await assert.rejects(publishPinterestVideo(video,f.job,f.options),/checkpoint failed/);
 assert.ok(f.logs.some(x=>x.includes('Pinterest Pin created: 9876543210')));
 assert.equal(f.calls.filter(x=>x.route==='/pins').length,1);
});
