import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyBoards,removeUnwantedBoards} from '../scripts/remove-nine-pinterest-boards.mjs';
const keep={
 '1038924276479981121':'Sapiver Prints',
 '1038924276479876865':'Sapiver Press Publishing',
 '1038924276479983705':'Social'
};
const others={
 '1038924276479911800':'a.i news feed',
 '1038924276479841292':'AntiKing Sudoku',
 '1038924276479929523':'Clearforge',
 '1038924276479851513':'Facebook puzzles',
 '1038924276479879508':'Isla_Comic',
 '1038924276479869758':'Printable Sudoku Puzzles',
 '1038924276479851509':'Projects to try',
 '1038924276479849275':'Quick saves',
 '1038924276479840944':'Sudoku Books by Sapiver Press'
};
const boards=()=>Object.entries({...keep,...others}).map(([id,name])=>({id,name,is_owner:true}));
const receipts={byListingId:Object.fromEntries(Array.from({length:32},(_,i)=>[String(i+100),{pinId:String(i+10000)}]))};
function fake({protectedInOther=false,badBoard=false,failOn=null}={}){
 let state=boards(),actions=[],pinData={};
 for(const id of Object.keys(others))pinData[id]=[];
 pinData['1038924276479840944']=[{id:'1038924207806697972',title:'Sudoku book',link:'https://amzn.to/example'}];
 if(protectedInOther)pinData['1038924276479911800'].push({id:'1234512345',title:'Sapiver Prints poster',link:'https://www.etsy.com/listing/4598484808'});
 if(badBoard)state.push({id:'99999',name:'Unexpected board'});
 async function fetchImpl(url,opts={}){
  const u=new URL(url),method=opts.method||'GET',part=u.pathname,ids=part.split('/');actions.push({method,path:part});
  if(method==='DELETE'&&part.startsWith('/v5/boards/')){
   const id=ids[3];if(id===failOn)return {status:429,ok:false};
   state=state.filter(x=>x.id!==id);return {status:204,ok:true};
  }
  if(method==='GET'&&part==='/v5/boards')return {status:200,ok:true,json:async()=>({items:state,bookmark:null})};
  if(method==='GET'&&ids[2]==='boards'&&ids[4]==='pins')return {status:200,ok:true,json:async()=>({items:pinData[ids[3]]||[],bookmark:null})};
  throw Error('Unexpected call '+method+' '+part);
 }
 return {fetchImpl,actions,remaining:()=>state};
}
test('exact three boards protected, nine others identified',()=>{
 const target=classifyBoards(boards());
 assert.equal(target.length,9);
 assert.deepEqual(new Set(target.map(x=>x.id)),new Set(Object.keys(others)));
 assert.ok(target.every(x=>!keep[x.id]));
});
test('unknown, renamed or missing protected boards block any cleanup',()=>{
 assert.throws(()=>classifyBoards([...boards(),{id:'98765',name:'Surprise'}]),/Unknown/);
 assert.throws(()=>classifyBoards(boards().map(x=>x.name==='Social'?{...x,name:'Social posts'}:x)),/Unknown|Protected/);
 assert.throws(()=>classifyBoards(boards().filter(x=>x.name!=='Sapiver Prints')),/Protected/);
});
test('successfully removes only nine known boards and preserves exact three',async()=>{
 const x=fake(),progress=[];
 const r=await removeUnwantedBoards({fetchImpl:x.fetchImpl,token:'mock',receipts,sleep:async()=>{},onProgress:async p=>progress.push(JSON.parse(JSON.stringify(p)))});
 assert.equal(r.complete,true);
 assert.equal(r.removed.length,9);
 assert.deepEqual(x.remaining().map(z=>z.name).sort(),Object.values(keep).sort());
 assert.equal(x.actions.filter(z=>z.method==='DELETE').length,9);
 assert.equal(progress.length,11);
 assert.equal(Object.keys(r.pinCountByBoard).length,9);
});
test('any Sapiver Prints artwork on an unwanted board aborts BEFORE its deletion',async()=>{
 const x=fake({protectedInOther:true}),progress=[];
 await assert.rejects(removeUnwantedBoards({fetchImpl:x.fetchImpl,token:'mock',receipts,sleep:async()=>{},onProgress:async x=>progress.push(x)}),/Protected Sapiver Prints/);
 assert.ok(x.remaining().some(b=>b.name==='a.i news feed'));
 assert.ok(x.remaining().every(b=>b.id in keep||b.id in others));
 assert.equal(x.actions.some(a=>a.path==='/v5/boards/1038924276479911800'&&a.method==='DELETE'),false);
});
test('unknown board stops entire process without deleting anything',async()=>{
 const x=fake({badBoard:true});
 await assert.rejects(removeUnwantedBoards({fetchImpl:x.fetchImpl,token:'mock',receipts}),/Unknown/);
 assert.equal(x.actions.some(z=>z.method==='DELETE'),false);
});
test('API error retains deletion progress and never touches retained boards',async()=>{
 const x=fake({failOn:'1038924276479841292'}),progress=[];
 await assert.rejects(removeUnwantedBoards({fetchImpl:x.fetchImpl,token:'mock',receipts,sleep:async()=>{},onProgress:async p=>progress.push(JSON.parse(JSON.stringify(p)))}),/429/);
 assert.equal(progress.at(-1).removed.length,1);
 assert.ok(x.remaining().some(x=>x.name==='Sapiver Prints'));
 assert.ok(x.remaining().some(x=>x.name==='Social'));
 assert.ok(x.remaining().some(x=>x.name==='Sapiver Press Publishing'));
});
test('missing Sapiver Prints receipt IDs must fail before calling Pinterest',async()=>{
 const x=fake();
 await assert.rejects(removeUnwantedBoards({fetchImpl:x.fetchImpl,token:'mock',receipts:{byListingId:{}}}),/protections incomplete/);
 assert.equal(x.actions.length,0);
});
test('rerunning after successful deletion is idempotent',async()=>{
 const x=fake();
 const first=await removeUnwantedBoards({fetchImpl:x.fetchImpl,token:'mock',receipts,sleep:async()=>{}});
 const repeat=await removeUnwantedBoards({fetchImpl:x.fetchImpl,token:'mock',receipts,sleep:async()=>{}});
 assert.equal(first.removed.length,9);
 assert.equal(repeat.removed.length,0);
 assert.equal(repeat.missingBefore.length,9);
 assert.deepEqual(new Set(repeat.remainingBoards.map(x=>x.name)),new Set(Object.values(keep)));
});
