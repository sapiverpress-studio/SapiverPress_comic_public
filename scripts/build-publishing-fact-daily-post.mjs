import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();
const FACTS = "content/publishing-facts-daily-posts.csv";
const ABOUT = "copy/sapiver_press_about_copy.csv";
const OUT = "social/publishing-facts";
const DEFAULT_LINK = "https://sapiverpress.etsy.com";
const DEFAULT_SECONDARY = "https://suite.sapiverpress.co.uk";
const HASHTAGS = "#PublishingFacts #IndiePublishing #BookHistory #SelfPublishing #SapiverPress";

const read = (p) => fs.readFile(path.join(ROOT, p), "utf8");
const date = () => (/^\d{4}-\d{2}-\d{2}$/.test(process.env.DATE_OVERRIDE || "") ? process.env.DATE_OVERRIDE : new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
const dayOfYear = (d) => {
  const forced = Number.parseInt(process.env.FACT_DAY_OVERRIDE || "", 10);
  if (Number.isFinite(forced) && forced >= 1 && forced <= 365) return forced;
  const x = new Date(`${d}T12:00:00Z`), y = new Date(`${x.getUTCFullYear()}-01-01T12:00:00Z`);
  return Math.floor((x - y) / 86400000) + 1;
};
const csv = (t) => { const rows=[]; let r=[], c="", q=false; for (let i=0;i<t.length;i++){const ch=t[i], n=t[i+1]; if(q){ if(ch==='"'&&n==='"'){c+='"';i++;} else if(ch==='"') q=false; else c+=ch; } else if(ch==='"') q=true; else if(ch===','){r.push(c);c="";} else if(ch==='\n'){r.push(c);rows.push(r);r=[];c="";} else if(ch!=='\r') c+=ch;} if(c.length||r.length){r.push(c);rows.push(r);} const h=rows.shift()||[]; return rows.filter(a=>a.some(v=>String(v||"").trim())).map(a=>Object.fromEntries(h.map((k,i)=>[k,a[i]||""]))); };
const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const wrap = (s,n) => { const words=String(s).split(/\s+/).filter(Boolean), out=[]; let line=""; for(const w of words){const next=line?`${line} ${w}`:w; if(next.length>n&&line){out.push(line); line=w;} else line=next;} if(line) out.push(line); return out; };
const block = (lines,x,y,size,fill,weight=700,lh=1.2)=>lines.map((line,i)=>`<text x="${x}" y="${y+i*size*lh}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(line)}</text>`).join("\n");
const writeJson = async (p,v)=>{const f=path.join(ROOT,p); await fs.mkdir(path.dirname(f),{recursive:true}); await fs.writeFile(f,`${JSON.stringify(v,null,2)}\n`,"utf8");};

function svg(day, theme, fact, context, cta) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1350" fill="#F7F1E4"/>
  <rect x="54" y="54" width="972" height="1242" rx="38" fill="#FFFDF7" stroke="#D9B45F" stroke-width="6"/>
  <rect x="90" y="90" width="900" height="116" rx="24" fill="#0F3D3E"/>
  <text x="120" y="162" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#F7F1E4">Sapiver Press</text>
  <text x="120" y="255" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#B4862C">PUBLISHING FACT ${String(day).padStart(3,"0")}</text>
  <text x="120" y="305" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#0F3D3E">${esc(theme)}</text>
  <g font-family="Arial, Helvetica, sans-serif">
    ${block(wrap(fact,31).slice(0,8),120,430,54,"#102A2B",800,1.15)}
    <line x1="120" y1="900" x2="960" y2="900" stroke="#D9B45F" stroke-width="4"/>
    ${block(wrap(context,44).slice(0,3),120,975,35,"#233B3C",500,1.28)}
    <rect x="120" y="1135" width="840" height="92" rx="22" fill="#F7F1E4" stroke="#D9B45F" stroke-width="3"/>
    ${block(wrap(cta,38).slice(0,2),150,1192,31,"#0F3D3E",700,1.22)}
    <text x="120" y="1260" font-size="26" font-weight="700" fill="#0F3D3E">sapiverpress.etsy.com</text>
  </g></svg>`;
}

async function main(){
  const d = date(), day = dayOfYear(d);
  const facts = csv(await read(FACTS));
  const about = csv(await read(ABOUT));
  const factRow = facts.find(r => Number(r.day) === day); if (!factRow) throw new Error(`No publishing fact row for ${day}`);
  const usable = about.filter(r => String(r.copy || "").trim());
  const wanted = String(process.env.ABOUT_COPY_ID_OVERRIDE || "").trim();
  const brand = usable.find(r => String(r.id||"").trim() === wanted) || usable[(day - 1) % usable.length];
  const fact = factRow.fact || "";
  const theme = factRow.theme || "Publishing Facts";
  const context = "Publishing history is full of details that explain how books, rights, readers and products really work.";
  const cta = ["Did you know this one?","Which publishing fact surprised you most?","Would you turn this into a post or product idea?","What should more indie publishers know?"][(day - 1) % 4];
  const snippet = String(brand.copy || "").trim();
  const link = String(brand.primary_url || "").trim() || process.env.PUBLISHING_FACT_LINK_URL || DEFAULT_LINK;
  const secondary = String(brand.secondary_url || "").trim() || DEFAULT_SECONDARY;
  const caption = [snippet, `Today's publishing fact: ${fact}`, cta, HASHTAGS].filter(Boolean).join("\n\n");
  const dir = `${OUT}/${d}`, file = `publishing-fact-${String(day).padStart(3, "0")}.png`;
  await fs.mkdir(path.join(ROOT, dir), { recursive: true });
  await sharp(Buffer.from(svg(day, theme, fact, context, cta))).png().toFile(path.join(ROOT, dir, file));
  const manifest = { campaign:"publishing-facts-daily-posts", date:d, campaign_day:day, archive_dir:dir, files:[file], post_order:[file], title:`Publishing Fact ${String(day).padStart(3,"0")}`, theme, fact, context, cta, brand_copy_id:brand.id||null, brand_audience:brand.audience||null, brand_angle:brand.angle||null, brand_use_case:brand.use_case||null, brand_snippet:snippet, brand_primary_url:brand.primary_url||null, brand_secondary_url:brand.secondary_url||null, caption, hashtags:HASHTAGS, link_url:link, secondary_link_url:secondary, alt_text:`A Sapiver Press branded daily publishing fact card. Fact ${day}: ${fact}`.slice(0,500), product_referenced:{name:"Sapiver Press Publishing Systems",url:link}, post_ready_contract:{posting_allowed:true,posting_block_reasons:[]} };
  await writeJson(`${dir}/manifest.json`, manifest);
  await writeJson(`${OUT}/latest/manifest.json`, manifest);
  console.log(`Built publishing fact ${day} for ${d} using brand snippet ${manifest.brand_copy_id || "unknown"}`);
}
main().catch((e)=>{console.error(e); process.exit(1);});
