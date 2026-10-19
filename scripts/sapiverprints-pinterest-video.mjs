// Resumable organic Pinterest video publisher. Media checkpoint is not a posted Pin receipt.
// Keep media IDs to inspect a pending upload after GitHub's processing window expires.
const MEDIA_ID=/^[0-9]{4,40}$/;
const READY=new Set(['succeeded']);
const WAITING=new Set(['registered','processed','processing']);
const REJECTED=new Set(['failed']);

export async function publishPinterestVideo(video,job,{
  boardId,pinterestApi,request,ownerReport,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  log=console.log,
  pollLimit=60,
  pollIntervalMs=10000
}={}){
 if(!boardId||typeof pinterestApi!=='function'||typeof request!=='function'||typeof ownerReport!=='function')
   throw Error('Pinterest publisher integration unavailable');
 if(!Number.isInteger(pollLimit)||pollLimit<1||pollLimit>70||
    !Number.isInteger(pollIntervalMs)||pollIntervalMs<0||pollIntervalMs>120000)
   throw Error('Unsafe Pinterest polling bounds');
 let mediaId=job.pinterestMedia?.id||null;
 if(mediaId && !MEDIA_ID.test(String(mediaId)))throw Error('Stored Pinterest media ID invalid; do not re-upload');
 if(!mediaId){
   const registration=await pinterestApi('/media',{method:'POST',body:JSON.stringify({media_type:'video'})});
   mediaId=String(registration.media_id||'');
   if(!MEDIA_ID.test(mediaId)||typeof registration.upload_url!=='string'||
      !registration.upload_url.startsWith('https://'))
     throw Error('Pinterest media registration invalid');
   const form=new FormData();
   for(const [k,v] of Object.entries(registration.upload_parameters||{}))form.append(k,v);
   form.append('file',new Blob([video],{type:'video/mp4'}),'sapiverprints-promo.mp4');
   const uploaded=await request(registration.upload_url,{
     method:'POST',body:form,signal:AbortSignal.timeout(120000)
   });
   if(uploaded.status!==204)throw Error('Pinterest media transfer not confirmed (HTTP '+uploaded.status+')');
   await uploaded.arrayBuffer();
   // Save the ID before polling: later retries MUST reuse this uploaded media, not upload twice.
   log('Pinterest media transferred: '+mediaId);
   await ownerReport('pinterest_media',mediaId);
 }else{
   log('Resuming existing Pinterest media: '+mediaId+'; not uploading MP4 again');
 }
 let ready=false,lastStatus='';
 for(let n=0;n<pollLimit;n++){
   if(n>0)await sleep(pollIntervalMs);
   const result=await pinterestApi('/media/'+mediaId);
   if(String(result.media_id||mediaId)!==mediaId)throw Error('Pinterest media ID mismatch');
   const status=String(result.status||result.upload_status||'').toLowerCase();
   if(status!==lastStatus||n===pollLimit-1||n%6===0)log('Pinterest media '+mediaId+' status: '+(status||'missing')+' (poll '+(n+1)+')');
   lastStatus=status;
   if(READY.has(status)){ready=true;break;}
   if(REJECTED.has(status))throw Error('Pinterest media '+mediaId+' failed processing; no Pin created');
   if(!WAITING.has(status))throw Error('Pinterest media '+mediaId+' unexpected status '+(status||'missing')+'; no Pin created');
 }
 if(!ready)throw Error('Pinterest media '+mediaId+' still '+lastStatus+' after bounded wait; no Pin created. Resume same media ID');
 const payload={
   board_id:boardId,title:job.title.slice(0,100),
   description:(job.description+'\n\nFind Sapiver Prints on Etsy: '+job.link).slice(0,480),
   link:job.link,media_source:{source_type:'video_id',media_id:mediaId,cover_image_key_frame_time:0}
 };
 const pin=await pinterestApi('/pins',{method:'POST',body:JSON.stringify(payload)});
 const pinId=String(pin.id||'');
 if(!/^[0-9]+$/.test(pinId)||(pin.board_id&&String(pin.board_id)!==String(boardId)))
   throw Error('Pinterest Pin not confirmed; inspect before retrying');
 log('Pinterest Pin created: '+pinId+' (media '+mediaId+'). Check before any retry');
 await ownerReport('pinterest',pinId);
 return pinId;
}
