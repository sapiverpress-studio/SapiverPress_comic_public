// Exact-owner, non-creating Pinterest copy enhancement for three already
// published Bicep Heart colourways. PIN IDs and Etsy IDs come from the
// successfully recorded Sapiver Prints API publication receipts.
// Does not change the board, image, destination link, Etsy or supplier data.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {pinterestToken} from './post-sapiver-prints.mjs';

export const BICEP_PIN_BOARD='1038924276479981121';
export const BICEP_PIN_UPDATES=Object.freeze([
 {colour:'Terracotta',listingId:'4623842263',pinId:'1038924207813666591',
  link:'https://www.etsy.com/listing/4623842263',
  title:'Terracotta Gym Wall Art | Retro Bicep Heart Poster',
  description:'Want home gym wall art with more personality than a workout chart? This retro bicep heart illustration pairs a strong woman pose with terracotta, coral and warm cream. Original AI-assisted physical A4 or A5 art print for a fitness room, workout corner or studio. See the terracotta edition on Etsy. #RetroGymDecor #StrongWomanArt #BicepHeart',
  alt_text:'Retro bicep heart wall art print in terracotta, rust and coral, showing a strong woman in profile making a heart shape using her flexed arm and fingers.',
  keywords:['terracotta gym wall art','retro home gym decor','bicep heart poster','strong woman print','workout room decoration','gym gift for her']},
 {colour:'Teal',listingId:'4623850034',pinId:'1038924207813666574',
  link:'https://www.etsy.com/listing/4623850034',
  title:'Teal Gym Wall Art | Retro Strong Woman Bicep Heart Print',
  description:'Looking for colourful wall art for a workout space? This teal and gold bicep heart poster features a strong woman illustration in a vintage-inspired gym print style. Original AI-assisted physical A4 or A5 poster for a home gym, fitness studio or gallery wall. Explore the teal edition on Etsy. #TealWallArt #GymGirlDecor #BicepHeart',
  alt_text:'Retro strong woman bicep heart poster with deep teal, turquoise, gold and warm cream graphic shapes, featuring the flexing-arm heart gesture.',
  keywords:['teal and gold wall art','gym girl poster','bicep heart print','women who lift gift','retro fitness decor','female strength art']},
 {colour:'Plum',listingId:'4623850842',pinId:'1038924207813666551',
  link:'https://www.etsy.com/listing/4623850842',
  title:'Purple Gym Wall Art | Plum and Lime Bicep Heart Poster',
  description:'Prefer gym wall decor that feels bold rather than motivational? This plum, magenta and lime bicep heart print brings a strong woman illustration to retro fitness wall art. Original AI-assisted physical poster in A4 or A5 for a workout corner, home gym or fitness-loving friend. See the plum edition on Etsy. #PurpleGymDecor #StrongWomanPoster #RetroFitnessArt',
  alt_text:'Vintage-inspired bicep heart artwork in plum purple, magenta and lime showing a strong woman in profile with her fingers forming a heart shape by her flexed bicep.',
  keywords:['purple gym wall art','plum and lime poster','bicep heart art','female empowerment decor','retro workout print','fitness gift for her']}
]);

async function pinterestRequest(fetchImpl,token,method,route,body){
 const response=await fetchImpl('https://api.pinterest.com/v5'+route,{
  method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 if(!response.ok)throw Error('Pinterest '+method+' returned HTTP '+response.status);
 return response.json();
}
function validateTarget(target,receipts){
 if(!target.pinId.match(/^\d{10,20}$/)||!target.listingId.match(/^\d{10,20}$/)||
    target.link!=='https://www.etsy.com/listing/'+target.listingId||
    target.title.length>100||target.description.length>800||target.alt_text.length>500)
  throw Error('Invalid Bicep Heart Pin metadata');
 const receipt=receipts?.byListingId?.[target.listingId];
 if(receipts?.boardName!=='Sapiver Prints'||receipt?.pinId!==target.pinId||
    receipt?.boardId!==BICEP_PIN_BOARD||receipt?.link!==target.link)
  throw Error('Pinterest publication receipt mismatch, no Pin update allowed');
}
export async function updateBicepPinCopies({fetchImpl=fetch,token,receipts,log=()=>{}}){
 if(!token||typeof token!=='string')throw Error('Missing existing Pinterest API credential');
 const results=[];
 for(const target of BICEP_PIN_UPDATES){
  validateTarget(target,receipts);
  const before=await pinterestRequest(fetchImpl,token,'GET','/pins/'+target.pinId);
  if(String(before.id)!==target.pinId||String(before.board_id)!==BICEP_PIN_BOARD||
     before.link!==target.link||before.is_owner===false)throw Error('Pin owner/board/link changed; refusing to edit');
  const fields={title:target.title,description:target.description,alt_text:target.alt_text};
  const unchanged=Object.entries(fields).every(([field,value])=>before[field]===value);
  if(!unchanged){
   const update=await pinterestRequest(fetchImpl,token,'PATCH','/pins/'+target.pinId,fields);
   if(String(update.id)!==target.pinId||String(update.board_id)!==BICEP_PIN_BOARD||
      update.link!==target.link)throw Error('Pinterest copy update did not confirm original Pin identity');
  }
  const after=await pinterestRequest(fetchImpl,token,'GET','/pins/'+target.pinId);
  if(String(after.id)!==target.pinId||String(after.board_id)!==BICEP_PIN_BOARD||
     after.link!==target.link||Object.entries(fields).some(([field,value])=>after[field]!==value))
   throw Error('Pinterest Pin copy readback did not match requested metadata');
  results.push({listingId:target.listingId,pinId:target.pinId,colour:target.colour,verified:true,updated:!unchanged});
  log('Verified targeted Pinterest Pin copy '+target.colour+' '+target.pinId);
 }
 return results;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{
  const receipts=JSON.parse(await fs.readFile('social/sapiver-prints/pinterest-receipts.json','utf8'));
  const token=await pinterestToken(fetch,process.env);
  const result=await updateBicepPinCopies({token,receipts,log:console.log});
  console.log('BICEP_PIN_COPY_RESULT '+JSON.stringify(result));
 }catch(error){console.error('Bicep Pin copy update stopped safely: '+String(error.message||error).slice(0,240));process.exitCode=1;}
}
