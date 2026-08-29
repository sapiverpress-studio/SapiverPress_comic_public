import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT=process.cwd();
const forgeRoot=path.resolve(process.env.SAPIVER_FORGE_ROOT||"vendor/sapiver-forge");
const expectedDate=String(process.env.DATE_OVERRIDE||"").trim();
if(!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) throw new Error("Project date is invalid.");

const manifestPath=path.join(forgeRoot,"parents-projects","manifest.json");
if(!fs.existsSync(manifestPath)) throw new Error("AI Inquisitive Parents manifest is missing.");
const source=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
const project=(source.projects||[]).find(item=>item.status==="ready"&&item.published_date===expectedDate);
if(!project) throw new Error(`No ready AI Inquisitive Parents project exists for ${expectedDate}.`);
if(!Number.isInteger(Number(project.day))||!project.title||!project.path||!project.poster_art) throw new Error("Project social metadata is incomplete.");

const artPath=path.join(forgeRoot,"public",String(project.poster_art).replace(/^\/+/, ""));
if(!fs.existsSync(artPath)) throw new Error(`Poster artwork is missing: ${artPath}`);
const out=path.join(ROOT,"social","ai-inquisitive-parents",expectedDate);
fs.mkdirSync(out,{recursive:true});

const xml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[char]));
function wrap(value,max=25,maxLines=3){
 const words=String(value||"").toUpperCase().split(/\s+/).filter(Boolean),lines=[];let line="";
 for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>max&&line){lines.push(line);line=word;if(lines.length===maxLines-1)break}else line=next}
 if(line&&lines.length<maxLines)lines.push(line);
 return lines;
}
const hook=wrap(project.social_hook||project.title,24,3);
const subtitle=wrap(project.social_subtitle||`Build a ${project.title} with AI`,30,3);
const hookSvg=hook.map((line,i)=>`<text x="70" y="${150+i*78}" font-size="65" font-weight="800" fill="${i===hook.length-1?"#e4c476":"#ffffff"}">${xml(line)}</text>`).join("");
const subtitleSvg=subtitle.map((line,i)=>`<text x="70" y="${1575+i*64}" font-size="50" font-weight="800" fill="#173c35">${xml(line)}</text>`).join("");
const frame=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
<rect width="1080" height="430" fill="#123b33"/>
<text x="70" y="72" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700" fill="#e4c476" letter-spacing="4">AI INQUISITIVE PARENTS · DAY ${String(project.day).padStart(3,"0")}</text>
<g font-family="Arial,Helvetica,sans-serif">${hookSvg}</g>
<rect x="0" y="1450" width="1080" height="470" fill="#fff8e9"/>
<rect x="70" y="1495" width="150" height="46" rx="23" fill="#dcebe5"/>
<text x="145" y="1527" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="23" font-weight="700" fill="#173c35">BUILD</text>
<g font-family="Arial,Helvetica,sans-serif">${subtitleSvg}</g>
<text x="70" y="1795" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="#405b53">A working family web app to try, change and make your own.</text>
<line x1="70" y1="1845" x2="1010" y2="1845" stroke="#c9a75d" stroke-width="3"/>
<text x="70" y="1890" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="700" fill="#173c35" letter-spacing="4">SAPIVER PRESS</text>
<text x="1010" y="1890" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="700" fill="#173c35">WORKING APP ON THE WEBSITE</text>
</svg>`;
const art=await sharp(artPath).resize(1080,1020,{fit:"cover",position:"centre"}).jpeg({quality:90}).toBuffer();
const imagePath=path.join(out,"tiktok-poster.png");
await sharp({create:{width:1080,height:1920,channels:3,background:"#fff8e9"}})
 .composite([{input:art,left:0,top:430},{input:Buffer.from(frame),left:0,top:0}])
 .png().toFile(imagePath);

const appUrl=`https://suite.sapiverpress.co.uk${project.path}`;
const caption=String(project.social_caption||`AI Inquisitive Parents: try building ${project.title} with AI. I made a working version—so can you. ${appUrl} #AIInquisitiveParents #FamilyFun #BuildWithAI`).trim();
fs.writeFileSync(path.join(out,"tiktok-caption.txt"),caption+"\n");
fs.writeFileSync(path.join(out,"app-link.txt"),appUrl+"\n");
fs.writeFileSync(path.join(out,"project-details.txt"),`${project.title}\n\n${project.summary}\n\n${project.privacy}\n${project.supervision}\n`);
const result={type:"ai_inquisitive_parents_social",schema_version:1,date:expectedDate,day:Number(project.day),slug:project.slug,title:project.title,source_repository:"sapiverpress-studio/SapiverForge",posting_allowed:false,human_approval_required:true,reason:"The package is prepared for manual review and posting.",files:{poster:"tiktok-poster.png",caption:"tiktok-caption.txt",app_link:"app-link.txt",details:"project-details.txt"}};
fs.writeFileSync(path.join(out,"manifest.json"),JSON.stringify(result,null,2)+"\n");
console.log(`Built AI Inquisitive Parents TikTok package for ${expectedDate}: ${project.title}.`);
