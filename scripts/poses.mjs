/*
 * 主人公の絵の各ポーズを、試作の時間を止めて撮る（?rig=1）。3倍の解像度で、主人公のまわりだけを切り出す。
 * 使い方: (cd app && npm run build) && node scripts/poses.mjs 出力先
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const O=process.argv[2];
const T={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const srv=createServer(async(q,s)=>{let p=new URL(q.url,'http://x').pathname.replace(/^\/akazukin/,'');if(p==='/')p='/index.html';try{const b=await readFile(join(new URL('../app/dist/', import.meta.url).pathname,p));s.writeHead(200,{'content-type':T[extname(p)]||'text/html'});s.end(b)}catch{s.writeHead(404).end()}});
await new Promise(r=>srv.listen(0,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
p.on('pageerror',e=>console.log('E',e.message)); p.on('console',m=>{if(m.type()==='warning'||m.type()==='error')console.log('c',m.text())});
await p.goto('http://127.0.0.1:'+srv.address().port+'/akazukin/?auto=1&rig=1');
await p.waitForFunction(()=>document.body.classList.contains('ready'));
await p.waitForTimeout(2500);
// 世界を止めて、主人公の状態を直接指定する
await p.evaluate(()=>{const s=window.akazukin.sim; s.hitStop=1e9; s.wolves=[]; s.hero.x=300; s.hero.facing=1; s.events=[];});
const cases=[['idle',null,0,'near'],['slash-a','slash',0.03,'near'],['slash-b','slash',0.15,'near'],['launch','launch',0.25,'near'],['slam-a','slam',0.05,'near'],['slam-b','slam',0.3,'near'],['kaiten','kaiten',0.18,'near'],['bow','bow',0.3,'far'],['down','down',0,'near'],['left',null,0,'near']];
for(const [name,move,t,stance] of cases){
  await p.evaluate(([move,t,stance,name])=>{const s=window.akazukin.sim,h=s.hero; s.stance=stance; h.move=move; h.moveT=t; h.down=name==='down'?2:0; h.facing=name==='left'?-1:1; h.stun=0;},[move,t,stance,name]);
  await p.waitForTimeout(400);
  const x=300/1000*(390-2*11.7)+11.7;
  await p.screenshot({path:`${O}/${name}.png`, clip:{x:Math.max(0,x-75),y:170,width:150,height:330}});
}
await b.close(); srv.close();
