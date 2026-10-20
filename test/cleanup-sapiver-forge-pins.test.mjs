import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPin,inventory,auditSignature,removeAudited} from '../scripts/cleanup-sapiver-forge-pins.mjs';
const printBoard='1038924276479981121',forgeBoard='8432112345';
const makePin=(id,board_id,title,link='',description='')=>({id,board_id,title,link,description,is_owner:true,is_removable:true});
const pins=[
 makePin('10001',forgeBoard,'Sapiver Forge AI daily briefing','https://suite.sapiverpress.co.uk/daily'),
 makePin('10002',forgeBoard,'Weekly headlines','https://suite.sapiverpress.co.uk/news'),
 makePin('10003',forgeBoard,'Sapiver Prints Nursery Poster','https://www.etsy.com/listing/4598484808'),
 makePin('10004',printBoard,'Capybara Christmas Poster','https://www.etsy.com/listing/4597458802'),
 makePin('10005','99999','A useful Sapiver Forge AI explainer','https://example.org/info'),
 makePin('10006','99999','Unrelated art','https://example.org/art'),
 makePin('10007',forgeBoard,'Sapiver Forge recent news','https://sapiverprints.etsy.com'),
 makePin('10008','99999','Unrelated saved artwork','https://example.org',{toString:()=>''})
];
pins[7].is_owner=false;
const boards=[{id:forgeBoard,name:'Sapiver Forge'},{id:printBoard,name:'Sapiver Prints'},{id:'99999',name:'General'}];
function mock(rows=pins,boardRows=boards){
 const requests=[];
 return {requests,fetchImpl:async(url,opts={})=>{
  const path=new URL(String(url)).pathname,method=opts.method||'GET';
  requests.push({path,method});
  if(path==='/v5/boards')return {ok:true,status:200,json:async()=>({items:boardRows,bookmark:null})};
  if(path==='/v5/pins'&&method==='GET')return {ok:true,status:200,json:async()=>({items:rows,bookmark:null})};
  if(path.startsWith('/v5/pins/')&&method==='DELETE')return {ok:true,status:204};
  throw Error('Unexpected Pinterest route '+method+' '+path);
 }};
}
test('all Sapiver Prints listings, Print board, and video shop links protected despite Forge board',()=>{
 const protectedIds=new Set(['10001']);
 assert.equal(classifyPin(pins[0],'Sapiver Forge',protectedIds).action,'protect');
 assert.equal(classifyPin(pins[2],'Sapiver Forge').action,'protect');
 assert.equal(classifyPin(pins[3],'Sapiver Prints').action,'protect');
 assert.equal(classifyPin(pins[6],'Sapiver Forge').action,'protect');
 assert.equal(classifyPin(makePin('10009',forgeBoard,'Unbranded artwork','https://www.etsy.com/listing/4598484568'),'Sapiver Forge').action,'protect');
});
test('Forge-only board and explicitly labelled Forge Pins are selected, never miscellaneous Pins',()=>{
 assert.equal(classifyPin(pins[1],'Sapiver Forge').action,'candidate');
 assert.equal(classifyPin(pins[4],'General').action,'candidate');
 assert.equal(classifyPin(pins[5],'General').action,'skip');
 assert.equal(classifyPin(pins[7],'General').action,'skip');
 const ordinary=makePin('10009',forgeBoard,'Normal Forge Pin','https://example.com');ordinary.is_removable=false;
 assert.equal(classifyPin(ordinary,'Sapiver Forge').action,'candidate');
 assert.equal(classifyPin(ordinary,'Clearforge').action,'candidate');
});
test('read-only inventory lists exact IDs and never DELETEs',async()=>{
 const m=mock();
 const report=await inventory({fetchImpl:m.fetchImpl,token:'test'});
 assert.equal(report.counts.all,8);
 assert.equal(report.counts.candidates,3);
 assert.equal(report.counts.protected,3);
 assert.ok(report.candidates.every(p=>typeof p.isOwner==='boolean'&&typeof p.adOnly==='boolean'));
 assert.deepEqual(report.candidates.map(x=>x.id),['10001','10002','10005']);
 assert.equal(report.candidateSignature,auditSignature(report.candidates));
 assert.ok(Array.isArray(report.unrelatedBoardReview));
 assert.equal(report.unrelatedBoardReview.reduce((n,b)=>n+b.count,0),report.counts.other);
 assert.ok(Array.isArray(report.aiNewsSample));
 assert.equal(m.requests.filter(x=>x.method==='DELETE').length,0);
});
test('a correctly hash-locked audit only deletes exact Forge Pins and preserves 32 Prints receipts',async()=>{
 const m=mock(),p=new Set(['10004']);
 const a=await inventory({fetchImpl:m.fetchImpl,token:'token',protectedIds:p});
 const deleted=[];
 const result=await removeAudited({fetchImpl:m.fetchImpl,token:'token',audit:a,expectedSignature:a.candidateSignature,protectedIds:p,sleep:async()=>{},onProgress:x=>deleted.push(x.deleted)});
 assert.equal(result.deletedIds.length,3);
 assert.deepEqual(deleted,['10001','10002','10005']);
 assert.equal(m.requests.filter(x=>x.method==='DELETE').length,3);
 assert.equal(m.requests.some(x=>x.path==='/v5/pins/10004'),false);
});
test('refuses DELETE when signature missing, changed or no audit',async()=>{
 const m=mock();
 const a=await inventory({fetchImpl:m.fetchImpl,token:'test'});
 await assert.rejects(removeAudited({fetchImpl:m.fetchImpl,token:'test',audit:a,expectedSignature:'bad'}),/signature/);
 await assert.rejects(removeAudited({fetchImpl:m.fetchImpl,token:'test',audit:null,expectedSignature:a.candidateSignature}),/audit/);
 assert.equal(m.requests.filter(x=>x.method==='DELETE').length,0);
});
test('if a previously Forge Pin now links to Sapiver Prints, skip it without deleting',async()=>{
 const old=mock(),a=await inventory({fetchImpl:old.fetchImpl,token:'test'});
 const changed=pins.map(p=>p.id==='10001'?{...p,link:'https://sapiverprints.etsy.com'}:p);
 const m=mock(changed);
 const result=await removeAudited({fetchImpl:m.fetchImpl,token:'test',audit:a,expectedSignature:a.candidateSignature,sleep:async()=>{}});
 assert.equal(result.deletedIds.length,2);
 assert.deepEqual(result.alreadyMissingIds,['10001']);
 assert.equal(m.requests.some(x=>x.path==='/v5/pins/10001'),false);
});
test('pins on an unknown board are not deleted without explicit Sapiver Forge branding',()=>{
 assert.equal(classifyPin(makePin('12345','unknown','Ordinary home poster'),'').action,'skip');
 assert.equal(classifyPin(makePin('12345','unknown','Sapiver Forge briefing'),'').action,'candidate');
});
