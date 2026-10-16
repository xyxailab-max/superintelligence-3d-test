/* Marketplace benchmark (test only). Loaded only with ?bench=1. Runs a fixed, hands-off script for about five minutes
   and shows the results on screen. Adaptive quality is held off so the numbers show the real cost of each scene.
   Segments: atrium idle / atrium navigating (= Phase 1 content), gallery idle / navigating / opening and closing products,
   then a soak that keeps mixing everything until the 5-minute mark. */
(function(){'use strict';
const M=window.__market;if(!M)return;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const B={seg:null,segs:{},timeline:[],t0:0,frame(dt,capped){const s=this.seg;if(!s)return;if(capped){s.capped++;return}s.d.push(dt*1000)}};
window.__bench=B;
const chip=document.createElement('div');chip.className='glass';chip.style.cssText='position:fixed;left:50%;top:calc(max(14px,env(safe-area-inset-top)) + 58px);transform:translateX(-50%);z-index:9;padding:10px 16px;border-radius:14px;font:600 12px/1.35 Manrope,system-ui,sans-serif;color:#E9EDFF;text-align:center;pointer-events:none;white-space:nowrap';
document.body.appendChild(chip);
const say=t=>{chip.textContent=t};
function begin(name){B.seg={name,d:[],capped:0,t:performance.now()};B.segs[name]=B.seg}
function end(){const s=B.seg;B.seg=null;if(s)s.ms=performance.now()-s.t;return s}
function summary(s){if(!s||s.d.length<5)return null;const d=s.d.slice().sort((a,b)=>a-b),n=d.length,sum=d.reduce((a,b)=>a+b,0);
 return {fps:+(1000*n/sum).toFixed(1),low1:+(1000/d[Math.min(n-1,Math.floor(n*.99))]).toFixed(1),under40:+(100*d.filter(x=>x>25).length/n).toFixed(1),worstMs:+d[n-1].toFixed(1),frames:n,capped:s.capped||0}}
async function seg(name,secs,act){begin(name);const tEnd=performance.now()+secs*1000;if(act)act();while(performance.now()<tEnd)await wait(200);const st=M.stats();const s=end();s.draws=st.calls;s.tris=st.tris}
const G=()=>M.gallery();
async function run(){
 const nav=performance.getEntriesByType('navigation')[0]||{};
 const load={htmlMs:Math.round(nav.responseEnd||0),scriptsMs:Math.round(nav.domContentLoadedEventEnd||0),firstFrameMs:Math.round(window.__mkReady||0)};
 say('Benchmark starting · please don\'t touch the screen (about 5½ min)');await wait(3000);
 M.skipIntro();M.atrium();await wait(3000);
 const mem0={gpuMB:M.gpuMB(),heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null,textures:M.stats().textures,geometries:M.stats().geometries};
 say('1/6 Atrium, standing still');await seg('atrium_idle',20);
 say('2/6 Atrium, moving between portals');let k=0;const iv=setInterval(()=>M.focus(k++%6),2500);await seg('atrium_nav',20);clearInterval(iv);
 M.focus(0);await wait(2600);
 say('3/6 Entering the AI Agents gallery');const te=performance.now();begin('enter');M.enterGallery(0);
 while(!(G()&&G().state().phase==='on')&&performance.now()-te<20000)await wait(50);end();const enterMs=Math.round(performance.now()-te);
 await wait(2500);const memG={gpuMB:M.gpuMB(),heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null,textures:M.stats().textures,geometries:M.stats().geometries};
 say('4/6 Gallery, standing still');await seg('gallery_idle',20);
 say('5/6 Gallery, moving between products');let dir=1;const iv2=setInterval(()=>{const s=G().state();if(s.viewT>=s.n-1)dir=-1;if(s.viewT<=0)dir=1;G().step(dir)},1600);await seg('gallery_nav',20);clearInterval(iv2);
 say('6/6 Opening and closing products');let o=0;begin('cards_open_close');const tc=performance.now()+24000;
 while(performance.now()<tc){G().open(o%8);o+=3;await wait(2000);G().close();await wait(2000)}
 {const st=M.stats(),s=end();s.draws=st.calls;s.tris=st.tris}
 // Soak: keep mixing everything until five minutes after the start of segment 1.
 const tS=B.segs.atrium_idle.t,tFinish=tS+300000;let i=0,next=performance.now()+15000;begin('soak');
 while(performance.now()<tFinish){const left=Math.ceil((tFinish-performance.now())/1000);say('Soak test · '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0')+' left');
  const g=G(),ph=g?g.state().phase:'off';
  if(ph==='on'){const a=i%5;if(a===0)g.step(1);else if(a===1)g.open(i%8);else if(a===2)g.close();else if(a===3)g.step(-1);else g.exit();}
  else if(M.cam().mode==='focus')M.enterGallery(0);
  i++;await wait(3000);
  if(performance.now()>=next){const s=B.seg,d=s.d.splice(0);B.timeline.push({t:Math.round((performance.now()-tS)/1000),...(summary({d,capped:s.capped})||{}),heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null});s.capped=0;next+=15000}}
 end();
 if(G()&&G().state().phase==='on'){G().exit();await wait(1500)}await wait(1500);
 const mem1={gpuMB:M.gpuMB(),heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null,textures:M.stats().textures,geometries:M.stats().geometries};
 const st=M.stats(),gs=G()?G().state():{};
 const tl=B.timeline,first=tl.slice(0,4),last=tl.slice(-4),avg=a=>a.length?+(a.reduce((x,y)=>x+(y.fps||0),0)/a.length).toFixed(1):null;
 const R={when:new Date().toISOString(),ua:navigator.userAgent,screen:[innerWidth,innerHeight,devicePixelRatio],tier:st.tier,dpr:st.dpr,canvas:st.canvas,bloom:st.bloom,mirror:st.mirror,qualitySteps:st.autoSteps,
  load:Object.assign(load,{galleryEnterMs:enterMs,galleryBuildMs:gs.buildMs}),
  segments:Object.fromEntries(['atrium_idle','atrium_nav','gallery_idle','gallery_nav','cards_open_close'].map(k=>[k,Object.assign(summary(B.segs[k])||{},{draws:B.segs[k].draws,tris:B.segs[k].tris})])),
  enterTransition:summary(B.segs.enter),soak:{firstMinFps:avg(first),lastMinFps:avg(last),timeline:tl},memory:{atriumStart:mem0,galleryBuilt:memG,end:mem1}};
 window.__benchResult=R;show(R);say('Benchmark finished');setTimeout(()=>chip.remove(),2500)}
function cost(a,g){if(!a||!g||!a.fps||!g.fps)return '–';const ma=1000/a.fps,mg=1000/g.fps,d=mg-ma;return 'frame time '+ma.toFixed(1)+' ms → '+mg.toFixed(1)+' ms ('+(d>=0?'+':'')+d.toFixed(1)+' ms) · draws '+a.draws+' → '+g.draws+(a.fps>58&&g.fps>58?' · both at the 60 fps display limit':'')}
function show(R){const s=R.segments,row=(n,k)=>{const x=s[k]||{};return '<tr><td>'+n+'</td><td><b>'+(x.fps??'–')+'</b></td><td>'+(x.low1??'–')+'</td><td>'+(x.under40??'–')+'%</td><td>'+(x.draws??'–')+'</td></tr>'};
 const m=R.memory,el=document.createElement('div');el.className='glass';
 el.style.cssText='position:fixed;inset:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));z-index:11;border-radius:20px;padding:20px;overflow:auto;font:400 13px/1.45 Manrope,system-ui,sans-serif;color:#E9EDFF;max-width:640px;margin:auto;user-select:text;-webkit-user-select:text';
 el.innerHTML='<h2 style="margin:0 0 4px;font:500 30px/1.1 Cormorant Garamond,Georgia,serif">Marketplace benchmark</h2><div style="color:#9AA3C7;margin-bottom:12px">'+R.screen.join(' × ')+' · tier '+R.tier+' · '+R.canvas.join('×')+' px · glow '+(R.bloom?'on':'off')+' · mirror '+(R.mirror||'off')+'</div>'+
 '<style>#bTab td{padding:3px 0}#bTab td:first-child{text-align:left}</style><table id="bTab" style="width:100%;border-collapse:collapse;text-align:right"><thead style="color:#F0C674;font-size:11px;letter-spacing:.12em;text-transform:uppercase"><tr><td style="text-align:left">Segment</td><td>Avg fps</td><td>1% low</td><td>Frames &lt;40</td><td>Draws</td></tr></thead><tbody>'+
 row('Atrium · still (Phase 1)','atrium_idle')+row('Atrium · moving (Phase 1)','atrium_nav')+row('Gallery · still','gallery_idle')+row('Gallery · moving','gallery_nav')+row('Products open/close','cards_open_close')+'</tbody></table>'+
 '<p style="margin:12px 0 4px"><b>Loading:</b> page ready '+(R.load.firstFrameMs/1000).toFixed(2)+' s · gallery first open '+(R.load.galleryEnterMs/1000).toFixed(2)+' s (build '+R.load.galleryBuildMs+' ms)</p>'+
 '<p style="margin:4px 0"><b>Gallery cost vs Phase 1 atrium:</b> '+cost(s.atrium_idle,s.gallery_idle)+'</p>'+
 '<p style="margin:4px 0"><b>Soak (to the 5-minute mark):</b> start '+R.soak.firstMinFps+' fps → end '+R.soak.lastMinFps+' fps</p>'+
 '<p style="margin:4px 0"><b>Memory</b> (GPU estimate): atrium '+m.atriumStart.gpuMB+' MB → with gallery '+m.galleryBuilt.gpuMB+' MB → end '+m.end.gpuMB+' MB · textures '+m.atriumStart.textures+' → '+m.end.textures+(m.end.heapMB!=null?' · JS heap '+m.atriumStart.heapMB+' → '+m.end.heapMB+' MB':' · JS heap: not exposed by this browser')+'</p>'+
 '<p style="margin:4px 0;color:#9AA3C7">While a product stays open the scene idles at 30 fps by design (battery); those frames ('+(s.cards_open_close&&s.cards_open_close.capped||0)+') are excluded above.</p>'+
 '<div style="display:flex;gap:8px;margin-top:14px"><button id="bCopy" style="flex:1;height:44px;border-radius:99px;border:1px solid rgba(127,224,255,.55);background:linear-gradient(90deg,#3D7BFF,rgba(127,224,255,.6));color:#fff;font:700 12px Manrope,sans-serif;letter-spacing:.14em;text-transform:uppercase">Copy results</button><button id="bClose" class="round" style="width:44px;height:44px;border-radius:50%;border:1px solid rgba(127,224,255,.32);background:rgba(10,22,64,.45);color:#E9EDFF">✕</button></div>'+
 '<textarea id="bJson" readonly style="width:100%;height:90px;margin-top:10px;background:rgba(5,6,15,.6);color:#9AA3C7;border:1px solid #232A4A;border-radius:10px;font:11px ui-monospace,Menlo,monospace"></textarea>';
 document.body.appendChild(el);const ta=el.querySelector('#bJson');ta.value=JSON.stringify(R);
 el.querySelector('#bCopy').onclick=()=>{ta.select();try{navigator.clipboard.writeText(ta.value).then(()=>M.gallery()&&0)}catch(e){}try{document.execCommand('copy')}catch(e){}el.querySelector('#bCopy').textContent='Copied'};
 el.querySelector('#bClose').onclick=()=>el.remove()}
const go=()=>{if(window.__mkReady)run().catch(e=>{say('Benchmark stopped: '+e.message);console.error(e)});else setTimeout(go,200)};go();
})();
