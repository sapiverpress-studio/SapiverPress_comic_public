export async function publishYouTube(video,job,{token,request,ownerReport,log=console.log}){
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
 // videos.insert returns the requested status resource under youtube.upload scope.
 // A separate videos.list request requires read permission absent from the existing grant.
 // Retain the ID in logs before any validation/receipt failure, so recovery never guesses.
 log('YouTube upload accepted: '+data.id);
 if(data.status?.privacyStatus!=='public')throw Error('YouTube upload '+data.id+' is not confirmed public; inspect before reposting');
 if(!['uploaded','processed'].includes(data.status?.uploadStatus))throw Error('YouTube upload '+data.id+' has no accepted upload status; inspect before reposting');
 await ownerReport('youtube',data.id);
 return data.id;
}
