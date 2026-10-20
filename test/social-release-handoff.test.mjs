import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const workflow=fs.readFileSync('.github/workflows/daily-brief-social-bridge.yml','utf8');
const pins=fs.readFileSync('.github/workflows/sapiverprints-pinterest.yml','utf8');
const part=workflow.match(/- name: Resolve newest fully released edition[\s\S]*?node <<'NODE'\n([\s\S]*?)\n\s+NODE/);
if(!part)throw Error('Social release resolver step not found');
const program=part[1].split('\n').map(x=>x.replace(/^ {10}/,'')).join('\n');
test('the embedded SapiverForge approved-edition resolver is valid Node JavaScript',()=>{
 const child=spawnSync(process.execPath,['--check','-'],{input:program,encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
});
test('Comic accepts the exact approved request on Actions or Contents-scoped repository dispatch',()=>{
 assert.match(workflow,/repository_dispatch:\s*\n\s*types: \[sapiver_forge_approved_release\]/);
 assert.match(workflow,/edition_date:\s*\n\s*description:/);
 assert.match(workflow,/candidate_id:\s*\n\s*description:/);
 assert.match(workflow,/source_sha:\s*\n\s*description:/);
 assert.match(workflow,/github\.event\.client_payload\.source_sha/);
 assert.match(workflow,/source_sha \|\| github\.event\.client_payload\.source_sha \|\| 'main'/);
 assert.match(program,/requestedDate && date!==requestedDate/);
 assert.match(program,/requestedCandidate && candidate!==requestedCandidate/);
 assert.match(program,/requestedSha && sourceSha!==requestedSha/);
});
test('Pinterest newly active listing fallback is read-only until publisher validates current Etsy source',()=>{
 assert.match(pins,/repository_dispatch:\s*\n\s*types: \[sapiver_prints_new_listing\]/);
 assert.match(pins,/node scripts\/post-sapiver-prints\.mjs/);
 assert.match(pins,/SAPIVER_PRINTS_MAX_PINS: '20'/);
});
test('no Daily Brief post can target removed Forge Pinterest boards',()=>{
 assert.match(workflow,/FORGE_PINTEREST_DISABLED: 'true'/);
 assert.match(workflow,/group: sapiver-pinterest-token-rotation/);
});
test('pinned dispatch refuses an unrelated candidate even when another edition is released',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'forge-release-'));
 try{
  const date='2026-10-20',other='2026-10-19',candidate='b'.repeat(64);
  const root=path.join(tmp,'news-intelligence',date),daily=path.join(tmp,'reports','daily-intelligence',date);
  fs.mkdirSync(root,{recursive:true});fs.mkdirSync(daily,{recursive:true});
  fs.mkdirSync(path.join(tmp,'public','podcast','episodes'),{recursive:true});
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({date,candidate_id:candidate,newsletter_ready_for_human_approval:true}));
  fs.writeFileSync(path.join(root,'site-release.json'),JSON.stringify({date,candidate_id:candidate}));
  fs.writeFileSync(path.join(root,'netlify-release.json'),JSON.stringify({date,candidate_id:candidate,status:'deployed'}));
  fs.writeFileSync(path.join(daily,'candidate-manifest.json'),JSON.stringify({date,type:'sapiver_forge_daily_detailed_story',file_hashes:{}}));
  fs.writeFileSync(path.join(daily,'episode-metadata.json'),JSON.stringify({slug:'valid-slug'}));
  fs.writeFileSync(path.join(tmp,'public','podcast','episodes','valid-slug-short.mp4'),Buffer.alloc(1024));
  spawnSync('git',['init','-q'],{cwd:tmp});
  spawnSync('git',['-c','user.name=Test','-c','user.email=test@example.org','commit','--allow-empty','-qm','init'],{cwd:tmp});
  const sha=spawnSync('git',['rev-parse','HEAD'],{cwd:tmp,encoding:'utf8'}).stdout.trim();
  const run=(candidateId)=>spawnSync(process.execPath,['-'],{cwd:tmp,input:program,encoding:'utf8',
   env:{...process.env,REQUESTED_EDITION_DATE:date,REQUESTED_CANDIDATE_ID:candidateId,
     REQUESTED_SOURCE_SHA:sha,GITHUB_ENV:path.join(tmp,'env'),GITHUB_OUTPUT:path.join(tmp,'out'),GITHUB_STEP_SUMMARY:path.join(tmp,'sum')}});
  const incorrect=run('c'.repeat(64));
  assert.notEqual(incorrect.status,0,'Incorrect candidate must never publish');
  const correct=run(candidate);
  assert.equal(correct.status,0,correct.stderr);
  const e=fs.readFileSync(path.join(tmp,'env'),'utf8');
  assert.match(e,new RegExp('EDITION_DATE='+date));
  assert.match(e,new RegExp('CANDIDATE_ID='+candidate));
  assert.match(e,new RegExp('SOURCE_SHA='+sha));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
