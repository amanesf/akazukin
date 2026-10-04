// 点検用：時計を止めた試作（?manual=1）の中で式を1つ評価して、結果を JSON で出す。
// 使い方: node scripts/probe.mjs "(() => { const a = window.akazukin; a.tick(1/60, 60); return a.sim.hero; })()"
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const T={'.js':'text/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json','.svg':'image/svg+xml'};
const root=new URL('../app/dist', import.meta.url).pathname;
const srv=createServer(async(q,s)=>{let p=new URL(q.url,'http://x').pathname.replace(/^\/akazukin/,'');if(p==='/')p='/index.html';try{const b=await readFile(join(root,p));s.writeHead(200,{'content-type':T[extname(p)]||'text/html'});s.end(b)}catch{s.writeHead(404).end()}});
await new Promise(r=>srv.listen(0,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>console.log('E',e.message));
await p.goto('http://127.0.0.1:'+srv.address().port+'/akazukin/?auto=1&manual=1');
await p.waitForFunction(()=>document.body.classList.contains('ready'));
await p.waitForTimeout(1000);
const r = await p.evaluate(process.argv[2]);
console.log(JSON.stringify(r, null, 1));
await b.close(); srv.close();
