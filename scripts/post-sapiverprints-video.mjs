import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { pinterestToken, boardForPrints } from './post-sapiver-prints.mjs';

const exec=promisify(execFile);
const ROOT='https://sapiver-poster-gen-auth.netlify.app';
const API='https://api.pinterest.com/v5';
const id=process.env.SAPIVER_VIDEO_ID||'';
const ticket=process.env.SAPIVER_VIDEO_TICKET||'';
if(!/^[A-Za-z0-9_-]{32}$/.test(id)||!ticket)throw Error('Missing video job identity');
const endpoint=ROOT+'/poster/video/'+id+'/';
const sha=data=>createHash('sha256').update(data).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url,opts={}){
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),...opts});
 if(!response.ok)throw Error('HTTP '+response.status+' from '+new URL(url).hostname);
 return response;
}
async function ownerGet(route){
 const response=await request(endpoint+route,{headers:{Authorization:'Bearer '+ticket}});
 return response;
}
async function ownerReport(platform,postedId){
 const response=await request(endpoint+'report',{method:'POST',headers:{Authorization:'Bearer '+ticket,'Content-Type':'application/json'},body:JSON.stringify({platform,id:postedId})});
 const data=await response.json();
 if(data.confirmed!==true)throw Error('Publisher receipt not accepted; do not retry blindly');
}
async function oauth(){
 const required=['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN'];
 if(required.some(n=>!process.env[n]))throw Error('YouTube existing API credentials unavailable');
 const body=new URLSearchParams({
  client_id:process.env.YOUTUBE_CLIENT_ID,
  client_secret:process.env.YOUTUBE_CLIENT_SECRET,
  refresh_token:process.env.YOUTUBE_REFRESH_TOKEN,
  grant_type:'refresh_token'
 });
 const response=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 const data=await response.json();
 if(!data.access_token)throw Error('YouTube authentication did not return access token');
 return data.access_token;
}
async function publishYouTube(video,job){
 const token=await oauth();
 const description=[job.description,'','Browse Sapiver Prints:',job.link,'','#Shorts #SapiverPrints #WallArt'].join('\n').slice(0,4600);
 const meta={snippet:{title:job.title.slice(0,100),description,categoryId:'10',defaultLanguage:'en-GB'},status:{privacyStatus:'public',selfDeclaredMadeForKids:false}};
 const init=await request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'video/mp4','X-Upload-Content-Length':String(video.byteLength)},body:JSON.stringify(meta)
 });
 const uploadUrl=init.headers.get('location');
 if(!uploadUrl||!uploadUrl.startsWith('https://'))throw Error('YouTube resumable upload URL unavailable');
 const result=await request(uploadUrl,{method:'PUT',headers:{'Content-Type':'video/mp4','Content-Length':String(video.byteLength)},body:video});
 const data=await result.json();
 if(!/^[A-Za-z0-9_-]{11}$/.test(String(data.id||'')))throw Error('YouTube did not return a video ID; inspect upload');
 // Do not treat an unverified upload response as a confirmed published video.
 let confirmed=false;
 for(let attempt=0;attempt<8;attempt++){
  const check=await request('https://www.googleapis.com/youtube/v3/videos?part=status&id='+encodeURIComponent(data.id),{headers:{Authorization:'Bearer '+token}});
  const verified=await check.json();
  if(verified.items?.some(v=>v.id===data.id&&v.status?.privacyStatus==='public')){confirmed=true;break;}
  await sleep(3000);
 }
 if(!confirmed)throw Error('YouTube visibility not confirmed after read-back; inspect before reposting');
 await ownerReport('youtube',data.id);
 return data.id;
}
async function pinterestApi(route,token,opts={}){
 const result=await request(API+route,{...opts,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...opts.headers}});
 return result.json();
}
async function publishPinterest(video,job){
 const token=await pinterestToken(fetch,{...process.env,GH_TOKEN:process.env.GH_TOKEN});
 const board=await boardForPrints(fetch,token);
 if(!board.id)throw Error('Sapiver Prints Pinterest board not found');
 const registration=await pinterestApi('/media',token,{method:'POST',body:JSON.stringify({media_type:'video'})});
 if(!registration.media_id||!registration.upload_url||!registration.upload_url.startsWith('https://'))throw Error('Pinterest did not accept video registration');
 const form=new FormData();
 for(const [k,v] of Object.entries(registration.upload_parameters||{}))form.append(k,v);
 form.append('file',new Blob([video],{type:'video/mp4'}),'sapiverprints-promo.mp4');
 const uploaded=await request(registration.upload_url,{method:'POST',body:form,signal:AbortSignal.timeout(120000)});
 await uploaded.arrayBuffer();
 let ready=false;
 for(let n=0;n<30;n++){
  await sleep(10000);
  const result=await pinterestApi('/media/'+registration.media_id,token);
  const status=String(result.status||result.upload_status||'').toLowerCase();
  if(['succeeded','success','available','ready'].includes(status)){ready=true;break;}
  if(['failed','failure','rejected'].includes(status))throw Error('Pinterest media processing failed');
 }
 if(!ready)throw Error('Pinterest media processing timed out; inspect before reposting');
 const payload={
  board_id:board.id,title:job.title.slice(0,100),description:(job.description+'\n\nFind Sapiver Prints on Etsy: '+job.link).slice(0,480),
  link:job.link,media_source:{source_type:'video_id',media_id:registration.media_id,cover_image_key_frame_time:0}
 };
 const pin=await pinterestApi('/pins',token,{method:'POST',body:JSON.stringify(payload)});
 if(!/^\d+$/.test(String(pin.id||''))||(pin.board_id&&String(pin.board_id)!==String(board.id)))throw Error('Pinterest Pin not confirmed; inspect before retrying');
 await ownerReport('pinterest',String(pin.id));
 return String(pin.id);
}
async function main(){
 const job=await (await ownerGet('job')).json();
 if(job.id!==id||job.link!=='https://sapiverprints.etsy.com'||!job.sha256||!job.bytes)throw Error('Unexpected publisher metadata');
 if(job.platforms?.youtube?.id&&job.platforms?.pinterest?.id){console.log('Both platform receipts already recorded');return;}
 const segments=[];
 for(let i=0;i<Math.ceil(job.bytes/2000000);i++){
  const received=Buffer.from(await (await ownerGet('source/'+i)).arrayBuffer());
  const expected=Math.min(2000000,job.bytes-i*2000000);
  if(received.length!==expected)throw Error('Video media segment incomplete');
  segments.push(received);
 }
 const video=Buffer.concat(segments);
 if(video.length!==job.bytes||sha(video)!==job.sha256||video.subarray(4,8).toString('ascii')!=='ftyp')throw Error('Video content mismatch');
 const temp=await mkdtemp(path.join(tmpdir(),'sapiverprints-video-'));
 try{
  const file=path.join(temp,'post.mp4');await fs.writeFile(file,video);
  const {stdout}=await exec('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{timeout:20000});
  const info=JSON.parse(stdout);
  const duration=Number(info.format?.duration),v=info.streams?.find(s=>s.codec_type==='video');
  if(!v||!Number.isFinite(duration)||duration<8||duration>12||v.width>=v.height)throw Error('Video must be vertical and 8–12 seconds');
  if(!job.platforms?.youtube?.id){
   const yt=await publishYouTube(video,job);console.log('Confirmed YouTube video '+yt);
  }else console.log('YouTube already confirmed; skipping');
  if(!job.platforms?.pinterest?.id){
   const pin=await publishPinterest(video,job);console.log('Confirmed Pinterest video '+pin);
  }else console.log('Pinterest already confirmed; skipping');
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(async e=>{console.error('Sapiver Prints video needs attention: '+String(e.message||e).slice(0,250));try{await request(endpoint+'fail',{method:'POST',headers:{Authorization:'Bearer '+ticket,'Content-Type':'application/json'},body:'{}'});}catch{console.error('Could not report failed job; inspect private uploader');}process.exitCode=1;});
