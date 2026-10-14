/* Use Superintelligence: Creator Marketplace, Phase 2. One product gallery (AI Agents).
   Loaded by market.js only when a visitor chooses the AI Agents portal. Builds nothing until they enter.
   Cost when inside: ~6 draw calls (one instanced mesh for all cards, one for their light pools, rail, backdrop, dust)
   while the whole atrium is hidden, so the gallery is cheaper to draw than the atrium it replaces. */
window.__mkGallery=function(MK){'use strict';
const {THREE,$,scene,camera,renderer,U}=MK,clamp=MK.clamp,motion=MK.motion,reduce=MK.reduceMotion;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,sm=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};

// ================= Data (fetched once, as soon as this file loads) =================
const dataP=fetch('./marketplace/catalog.json?v=2',{cache:'force-cache'}).then(r=>{if(!r.ok)throw new Error('catalog '+r.status);return r.json()});
const fontsP=Promise.race([Promise.all(["600 40px 'Cormorant Garamond'","600 16px Manrope","700 16px Manrope"].map(f=>document.fonts?document.fonts.load(f):0)),new Promise(r=>setTimeout(r,1500))]).catch(()=>{});
const price=p=>p.price&&p.price.amount>0?'$'+p.price.amount:'Free';

// ================= Preview art, painted in code (brand colours only, no text in the art) =================
const AQ='#7FE0FF',GD='#F0C674',SG='#3D7BFF';
function rnd(seed){let s=seed*9301+49297;return()=>(s=(s*9301+49297)%233280)/233280}
function art(c,x,y,w,h,kind,seed){const r=rnd(seed+1);c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
 let g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,'#0C1A4A');g.addColorStop(1,'#05060F');c.fillStyle=g;c.fillRect(x,y,w,h);
 const cx=x+w*(.5+(r()-.5)*.2),cy=y+h*(.52+(r()-.5)*.12),m=Math.min(w,h);
 g=c.createRadialGradient(cx,cy,0,cx,cy,m*.75);g.addColorStop(0,'rgba(61,123,255,.55)');g.addColorStop(.45,'rgba(61,123,255,.12)');g.addColorStop(1,'rgba(61,123,255,0)');c.fillStyle=g;c.fillRect(x,y,w,h);
 for(let i=0;i<70;i++){c.fillStyle='rgba(200,235,255,'+(.15+r()*.6)+')';const s=r()*1.6+.3;c.fillRect(x+r()*w,y+r()*h,s,s)}
 c.lineCap='round';c.globalCompositeOperation='lighter';
 const glow=(col,b)=>{c.shadowColor=col;c.shadowBlur=b};
 const stroke=(col,lw,b)=>{c.strokeStyle=col;c.lineWidth=lw;glow(col,b);c.stroke()};
 const dot=(px,py,rad,col,b)=>{c.beginPath();c.arc(px,py,rad,0,7);c.fillStyle=col;glow(col,b);c.fill()};
 if(kind==='orbit'){for(let k=0;k<3;k++){c.beginPath();c.ellipse(cx,cy,m*(.36-k*.07),m*(.13+k*.03),-.5+k*.55,0,7);stroke(k===1?GD:AQ,1.6,10)}dot(cx,cy,m*.07,'#BFEFFF',30);dot(cx+m*.33,cy-m*.08,m*.02,GD,14)}
 else if(kind==='waves'){for(let k=0;k<5;k++){c.beginPath();for(let i=0;i<=60;i++){const t=i/60,px=x+w*.1+t*w*.8,py=cy+Math.sin(t*6.3+k*.7)*m*(.06+k*.015)-(k-2)*m*.06;i?c.lineTo(px,py):c.moveTo(px,py)}stroke(k===2?GD:AQ,k===2?2:1.2,10)}}
 else if(kind==='lines'){for(let k=0;k<6;k++){const py=y+h*.26+k*h*.09,l=w*(.35+r()*.4);c.beginPath();c.moveTo(x+w*.16,py);c.lineTo(x+w*.16+l,py);stroke(k===0?GD:AQ,k===0?3:1.6,8)}dot(x+w*.16,y+h*.26,4,GD,12)}
 else if(kind==='rise'){c.beginPath();for(let i=0;i<=40;i++){const t=i/40,px=x+w*.12+t*w*.76,py=y+h*.8-Math.pow(t,1.6)*h*.55-Math.sin(t*9)*h*.03;i?c.lineTo(px,py):c.moveTo(px,py)}stroke(AQ,2,12);dot(x+w*.88,y+h*.25,m*.035,GD,24);
  for(let k=0;k<5;k++){const bx=x+w*(.18+k*.14),bh=h*(.08+k*.07);c.fillStyle='rgba(127,224,255,.16)';c.shadowBlur=0;c.fillRect(bx,y+h*.86-bh,w*.07,bh)}}
 else if(kind==='crystal'){const s=m*.3;c.beginPath();c.moveTo(cx,cy-s*1.3);c.lineTo(cx+s*.75,cy-s*.2);c.lineTo(cx,cy+s*1.2);c.lineTo(cx-s*.75,cy-s*.2);c.closePath();stroke(AQ,1.8,16);
  c.beginPath();c.moveTo(cx-s*.75,cy-s*.2);c.lineTo(cx+s*.75,cy-s*.2);c.moveTo(cx,cy-s*1.3);c.lineTo(cx,cy+s*1.2);stroke('rgba(191,239,255,.7)',1,6);c.beginPath();c.arc(cx,cy,s*1.55,-.6,.9);stroke(GD,1.6,10)}
 else if(kind==='steps'){for(let k=0;k<5;k++){c.beginPath();const sx=x+w*(.16+k*.14),sy=y+h*(.78-k*.11);c.moveTo(sx,sy);c.lineTo(sx+w*.12,sy);stroke(k===4?GD:AQ,2.4,12)}dot(x+w*.82,y+h*.24,m*.05,GD,26)}
 else if(kind==='radar'){for(let k=1;k<4;k++){c.beginPath();c.arc(cx,cy,m*.12*k,0,7);stroke('rgba(127,224,255,.55)',1.1,6)}c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+m*.36*Math.cos(-.7),cy+m*.36*Math.sin(-.7));stroke(AQ,2,14);
  for(let k=0;k<4;k++)dot(cx+(r()-.5)*m*.6,cy+(r()-.5)*m*.6,3,k?AQ:GD,12)}
 else{c.beginPath();for(let i=0;i<=50;i++){const t=i/50,px=x+w*.12+t*w*.76,py=cy+Math.sin(t*5.5)*h*.2*(1-t*.4);i?c.lineTo(px,py):c.moveTo(px,py)}c.setLineDash([2,9]);stroke(AQ,2.2,10);c.setLineDash([]);
  for(const t of [0,.5,1])dot(x+w*.12+t*w*.76,cy+Math.sin(t*5.5)*h*.2*(1-t*.4),5,t===1?GD:AQ,16)}
 c.restore()}
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function wrap(c,t,maxW,maxL){const out=[];let line='';for(const w of t.split(' ')){const n=line?line+' '+w:w;if(c.measureText(n).width>maxW&&line){out.push(line);line=w}else line=n}if(line)out.push(line);
 if(out.length>maxL){out.length=maxL;let l=out[maxL-1];while(l&&c.measureText(l+'…').width>maxW)l=l.slice(0,-1);out[maxL-1]=l.replace(/[\s,.;:]+$/,'')+'…'}return out}

// ================= Atlas: all card faces of one gallery in one texture =================
const COLS=4,ROWS=2,TW=384,TH=512; // 1536 x 1024; card face aspect 3:4 matches the card geometry
function buildAtlas(list,creators){const cv=document.createElement('canvas');cv.width=COLS*TW;cv.height=ROWS*TH;const c=cv.getContext('2d');
 list.forEach((p,i)=>{const x=(i%COLS)*TW,y=Math.floor(i/COLS)*TH,pad=22,aw=TW-pad*2,ah=Math.round(TH*.5);
  c.save();rr(c,x+pad,y+pad,aw,ah,16);c.clip();art(c,x+pad,y+pad,aw,ah,p.art,i*7+3);c.restore();
  c.save();rr(c,x+pad+.5,y+pad+.5,aw-1,ah-1,16);c.strokeStyle='rgba(127,224,255,.35)';c.lineWidth=1;c.stroke();c.restore();
  // "Sample" tag on the art
  c.font="700 11px Manrope, system-ui, sans-serif";const tg='SAMPLE',tw=c.measureText(tg).width+18;c.save();rr(c,x+pad+12,y+pad+12,tw,22,11);c.fillStyle='rgba(7,9,20,.72)';c.fill();c.strokeStyle='rgba(240,198,116,.55)';c.stroke();c.restore();
  c.fillStyle='#F0C674';c.textBaseline='middle';c.fillText(tg.split('').join(String.fromCharCode(8202)),x+pad+21,y+pad+23.5);
  let ty=y+pad+ah+40;c.textBaseline='alphabetic';
  c.font="600 13px Manrope, system-ui, sans-serif";c.fillStyle='#9AA3C7';c.fillText(String(i+1).padStart(2,'0')+'  ·  AI AGENT',x+pad+2,ty);ty+=40;
  c.font="600 36px 'Cormorant Garamond', Georgia, serif";c.fillStyle='#E9EDFF';for(const l of wrap(c,p.title,aw-4,2)){c.fillText(l,x+pad,ty);ty+=36}
  c.font="400 15.5px Manrope, system-ui, sans-serif";c.fillStyle='#9AA3C7';ty+=4;for(const l of wrap(c,p.short,aw-6,2)){c.fillText(l,x+pad+1,ty);ty+=22}
  const by=y+TH-pad-14;c.strokeStyle='rgba(240,198,116,.28)';c.beginPath();c.moveTo(x+pad,by-30);c.lineTo(x+TW-pad,by-30);c.stroke();
  c.font="600 14px Manrope, system-ui, sans-serif";c.fillStyle='#C9D0EE';c.fillText((creators[p.creatorId]||{}).name||'',x+pad+1,by);
  c.font="700 19px Manrope, system-ui, sans-serif";c.fillStyle='#F0C674';const pr=price(p);c.fillText(pr,x+TW-pad-c.measureText(pr).width,by)});
 const t=new THREE.CanvasTexture(cv);t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;return t}

// ================= Shaders =================
const FACE=Math.PI; // the arc faces the calm, open side of the sky (planets and galaxies stay behind you)
const CW=1.8,CH=2.4,RA=7.2,SP=.31,CY=2.42,CAMH=2.32,FWD=1.6; // camera stands FWD metres in front of the arc centre, so the centred card is the nearest
const CARD_VS=`attribute float aI;uniform float uT,uS[NC],uP;varying vec2 vU;varying float vI,vS;varying vec3 vW,vN;
void main(){vU=uv;vI=aI;float s=uS[int(aI+.5)];vS=s;vec3 p=position;
 float sel=smoothstep(.5,1.,s);p.y+=sin(uT*.8+aI*1.7)*.055*(1.-sel);p.z+=sel*.95;p.xy*=1.+.035*s;
 vec4 w=modelMatrix*instanceMatrix*vec4(p,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix*instanceMatrix)*vec3(0.,0.,1.));gl_Position=projectionMatrix*viewMatrix*w;}`;
const CARD_FS=`uniform sampler2D uAtlas;uniform float uT,uP,uG;varying vec2 vU;varying float vI,vS;varying vec3 vW,vN;
float rbox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
void main(){vec2 p=(vU-.5)*vec2(${CW.toFixed(2)},${CH.toFixed(2)});float d=rbox(p,vec2(${(CW/2).toFixed(2)},${(CH/2).toFixed(2)}),.11);if(d>0.)discard;
 vec3 V=normalize(cameraPosition-vW);float fr=pow(1.-abs(dot(normalize(vN),V)),2.5);float s=vS,sel=smoothstep(.5,1.,s);
 vec3 body=mix(vec3(.012,.016,.05),vec3(.026,.06,.2),pow(vU.y,1.3)); // midnight sapphire glass: #070914 at the base to #0A1640 above
 float sheen=exp(-pow((vU.x*.9+vU.y*.55-.95+V.x*.9)*3.2,2.))*.07; // a soft reflection that slides as you move
 body+=vec3(.5,.75,1.)*sheen+vec3(.2,.5,1.)*fr*.2+vec3(.1,.25,.8)*exp(d*7.)*.18*(1.+s);
 vec2 tl=vec2(mod(vI,${COLS}.),floor(vI/${COLS}.));vec4 a=texture2D(uAtlas,vec2((tl.x+vU.x)/${COLS}.,1.-(tl.y+1.-vU.y)/${ROWS}.));
 vec3 c=mix(body,a.rgb*.66,a.a); // face content kept below the bloom threshold so text stays crisp, only the edges glow
 float e1=exp(-abs(d+.014)*240.),e2=exp(-abs(d+.06)*380.);
 c+=vec3(.5,.88,1.)*e1*(.55+.9*s)+vec3(1.,.77,.4)*e2*(.32+.5*s)*uG+vec3(.6,.85,1.)*exp(-abs(vU.y-.995)*90.)*.12;
 c*=1.-uP*(1.-sel)*.55; // other cards step back while a product is open
 gl_FragColor=vec4(c,mix(.9,1.,a.a));}`;
const POOL_FS=`uniform float uP;varying vec2 vU;varying float vS;void main(){vec2 q=(vU-.5)*2.;float r=length(q);if(r>1.)discard;float s=vS;
 float g=exp(-r*r*5.)*(.11+.22*s)+exp(-abs(r-.82)*60.)*(.05+.12*s);vec3 c=vec3(.18,.48,1.)*g+vec3(1.,.75,.4)*exp(-abs(r-.82)*90.)*(.04+.1*s);gl_FragColor=vec4(c*(1.-uP*.4),1.);}`;
const POOL_VS='attribute float aI;uniform float uS[NC];varying vec2 vU;varying float vS;void main(){vU=uv;vS=uS[int(aI+.5)];gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.);}';

// ================= One gallery =================
function makeGallery(cat,list,creators){const N=list.length,t0=performance.now();
 const grp=new THREE.Group();grp.visible=false;scene.add(grp);
 const aOf=i=>FACE+(i-(N-1)/2)*SP,pos=(i,r,y)=>MK.onCircle(aOf(i),r,y);
 const uS={value:new Array(N).fill(0)},uP={value:0},atlas=buildAtlas(list,creators);
 const def='#define NC '+N+'\n';
 // Cards: one instanced mesh, one draw call, one shared geometry, material and texture.
 const cardGeo=new THREE.PlaneGeometry(CW,CH);const aI=new Float32Array(N).map((_,i)=>i);cardGeo.setAttribute('aI',new THREE.InstancedBufferAttribute(aI,1));
 const cardMat=new THREE.ShaderMaterial({uniforms:{uAtlas:{value:atlas},uT:U.uT,uS,uP,uG:U.uGold},vertexShader:def+CARD_VS,fragmentShader:CARD_FS,transparent:true});
 const cards=new THREE.InstancedMesh(cardGeo,cardMat,N);const o=new THREE.Object3D();
 for(let i=0;i<N;i++){o.position.copy(pos(i,RA,CY));o.lookAt(0,CY,0);o.updateMatrix();cards.setMatrixAt(i,o.matrix)}cards.instanceMatrix.needsUpdate=true;cards.frustumCulled=false;grp.add(cards);
 // Light pools on the floor under each card (instanced, additive).
 const poolGeo=new THREE.PlaneGeometry(2.6,2.6).rotateX(-Math.PI/2);poolGeo.setAttribute('aI',new THREE.InstancedBufferAttribute(aI,1));
 const pools=new THREE.InstancedMesh(poolGeo,new THREE.ShaderMaterial({uniforms:{uS,uP},vertexShader:def+POOL_VS,fragmentShader:POOL_FS,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}),N);
 for(let i=0;i<N;i++){o.position.copy(pos(i,RA,.03));o.rotation.set(0,0,0);o.updateMatrix();pools.setMatrixAt(i,o.matrix)}pools.frustumCulled=false;grp.add(pools);
 // Floor rails: a gold arc under the cards and a fainter aether arc behind them (one draw).
 {const P=[],C=[],a0=aOf(0)-SP*.8,a1=aOf(N-1)+SP*.8;for(const [r,col,k] of [[RA-.2,[1,.72,.36],.38],[RA+1.6,[.3,.7,1],.3]])for(let i=0;i<96;i++){for(const t of [i/96,(i+1)/96]){const a=a0+(a1-a0)*t,f=Math.sin(Math.PI*t);P.push(Math.sin(a)*r,.02,-Math.cos(a)*r);C.push(col[0]*k*f,col[1]*k*f,col[2]*k*f)}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
  grp.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false})))}
 // Backdrop: a curved veil of sapphire light behind the arc, for depth (one draw, open cylinder segment).
 const back=new THREE.Mesh(new THREE.CylinderGeometry(13,13,9,48,1,true,Math.PI-(aOf(N-1)+.5),aOf(N-1)-aOf(0)+1),new THREE.ShaderMaterial({uniforms:{uT:U.uT},side:THREE.BackSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,
  vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform float uT;varying vec2 vU;void main(){float x=abs(vU.x-.5)*2.;float f=(1.-x*x)*smoothstep(0.,.35,vU.y)*smoothstep(1.,.45,vU.y);float b=.6+.4*sin(vU.x*18.+uT*.15)*sin(vU.y*5.-uT*.1);gl_FragColor=vec4(vec3(.07,.18,.55)*f*b*.55,1.);}'}));
 back.position.y=4.2;grp.add(back);
 // Drifting dust, blue and gold.
 {const d=[];for(let i=0;i<(MK.tier().dust>400?260:150);i++){const a=FACE+(Math.random()-.5)*2.4,r=3+Math.random()*10;d.push({p:[Math.sin(a)*r,Math.random()*7,-Math.cos(a)*r],c:Math.random()<.3?[1.,.78,.45]:[.55,.8,1.],s:.03+Math.random()*.05})}
  grp.add(MK.points(d,'void main(){vec3 p=position;p.y=mod(p.y+uT*(.07+.1*aSeed),7.);p.x+=sin(uT*.13+aSeed*40.)*.3;vC=aColor;vA=(.3+.5*(.5+.5*sin(uT*1.7+aSeed*70.)))*smoothstep(0.,1.,p.y)*smoothstep(7.,5.5,p.y);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=aSize*uScale/-mv.z;gl_Position=projectionMatrix*mv;}'))}
 cards.layers.enable(1);back.layers.enable(1); // cards reflect in the existing mirror floor; nothing else is added to the reflection pass
 const bytes=atlas.image.width*atlas.image.height*4*1.33;
 return {cat,list,N,grp,cards,uS,uP,aOf,bytes,buildMs:Math.round(performance.now()-t0),
  dispose(){scene.remove(grp);grp.traverse(x=>{if(x.geometry)x.geometry.dispose();if(x.material)x.material.dispose()});atlas.dispose()}}}

// ================= Manager: only one gallery is ever visible; at most two kept in memory =================
const built=new Map();let cur=null,catIndex=-1,data=null,creators={};
async function getGallery(cat){if(built.has(cat.id)){const g=built.get(cat.id);built.delete(cat.id);built.set(cat.id,g);return g}
 data=data||await dataP;await fontsP;creators={};for(const c of data.creators)creators[c.id]=c;
 const list=data.products.filter(p=>p.category===cat.id&&p.status==='approved').slice(0,COLS*ROWS);if(!list.length)throw new Error('empty');
 const g=makeGallery(cat,list,creators);built.set(cat.id,g);while(built.size>2){const [k,old]=built.entries().next().value;if(old===cur)break;old.dispose();built.delete(k)}return g}

// ================= Camera, state and transitions =================
const st={phase:'off',t:0,view:0,viewT:0,dolly:0,dollyT:0,sel:-1,panel:false,pk:0,lastInput:0,pending:null,wash:0};
const wash=$('wash'),washName=$('washName');
function setWash(v){v=+v.toFixed(3);if(v===st.wash)return;st.wash=v;wash.style.opacity=v;wash.style.visibility=v>0?'visible':'hidden'}
function enter(i,cat){catIndex=i;st.phase='in';st.t=0;st.ready=false;washName.textContent=cat.name;
 const th=MK.ANG[i];MK.goal.r=MK.R-.9;MK.goal.h=MK.PLAT+2.6;const t=MK.onCircle(th,MK.R+10,MK.PLAT+2.6);MK.goal.tx=t.x;MK.goal.ty=t.y;MK.goal.tz=t.z;
 const tb=performance.now();getGallery(cat).then(g=>{cur=g;st.ready=true;st.buildMs=built.size&&g.buildMs;st.firstOpenMs=Math.round(performance.now()-tb)}).catch(e=>{console.warn(e);st.phase='off';setWash(0);MK.toPortal(i);MK.toast('The gallery could not load. Please try again.')})}
function swapIn(){const g=cur;MK.world.visible=false;for(const m of MK.atriumOnly)m.visible=false;MK.floorU.uIn.value=1;g.grp.visible=true;MK.setMode('gallery');
 st.view=(g.N-1)/2;st.viewT=0;st.dolly=reduce?0:6;st.dollyT=0;if(reduce)st.view=0;st.sel=-1;st.panel=false;st.pk=0;g.uP.value=0;
 placeCamera();try{renderer.compile(scene,camera)}catch(e){} // compile while the screen is covered, so the first gallery frame doesn't stutter
 $('gbar').classList.add('on');$('gbar').setAttribute('aria-hidden','false');updateBar();
 try{history.replaceState(null,'','#'+g.cat.id+'/gallery')}catch(e){}
}
function exit(){if(st.phase!=='on')return;if(st.panel)closePanel(true);st.phase='out';st.t=0;$('gbar').classList.remove('on');$('gbar').setAttribute('aria-hidden','true')}
function swapOut(){const g=cur;g.grp.visible=false;MK.world.visible=true;for(const m of MK.atriumOnly)m.visible=true;MK.floorU.uIn.value=0;camera.clearViewOffset();
 const th=MK.ANG[catIndex],c=MK.cam;c.az=th;c.r=MK.R-1.6;c.h=MK.PLAT+2.5;const t=MK.onCircle(th,0,MK.PLAT+2.5);c.tx=t.x;c.ty=t.y;c.tz=t.z;MK.look.yaw=MK.look.yawT=MK.look.pitch=MK.look.pitchT=0;
 MK.fit();MK.toPortal(catIndex);try{history.replaceState(null,'','#'+g.cat.id)}catch(e){}}
function placeCamera(){const g=cur,a=g.aOf(st.view),f=FWD-st.dolly;camera.position.set(Math.sin(a)*f,CAMH+st.dolly*.12+Math.sin(performance.now()*.00035)*.04*motion,-Math.cos(a)*f);
 camera.lookAt(Math.sin(a)*RA,CY-.08-st.dolly*.05,-Math.cos(a)*RA)}
function step(d){if(!cur||st.phase!=='on')return;const n=clamp(Math.round(st.viewT)+d,0,cur.N-1);st.viewT=n;st.lastInput=performance.now();if(st.panel)fillPanel(n),st.sel=n;updateBar()}
function updateBar(){if(!cur)return;const i=clamp(Math.round(st.viewT),0,cur.N-1),p=cur.list[i];$('gIdx').textContent=cur.cat.short+' · '+String(i+1).padStart(2,'0')+' / '+String(cur.N).padStart(2,'0');$('gName').textContent=p.title}
function update(dt){if(st.phase==='off'||!MK)return;
 if(st.phase==='in'){st.t+=dt;const T=reduce?.45:1.05;setWash(sm(T*.3,T,st.t));if(st.t>=T&&st.ready){swapIn();st.phase='reveal';st.t=0}}
 else if(st.phase==='reveal'){st.t+=dt;const T=reduce?.35:.8;setWash(1-sm(0,T,st.t));if(st.t>=T){setWash(0);st.phase='on';if(st.pending){const k=cur.list.findIndex(p=>p.id===st.pending);st.pending=null;if(k>=0)open(k)}}}
 else if(st.phase==='out'){st.t+=dt;const T=reduce?.3:.45;st.dollyT=1.6;setWash(sm(0,T,st.t));if(st.t>=T){swapOut();st.phase='back';st.t=0}}
 else if(st.phase==='back'){st.t+=dt;const T=reduce?.3:.7;setWash(1-sm(0,T,st.t));if(st.t>=T){setWash(0);st.phase='off'}}
 if(!cur||!cur.grp.visible)return;
 // Card states: 1 = open in the panel, .35 = centred, 0 = resting.
 const ci=Math.round(st.viewT),k=1-Math.exp(-dt*6);for(let i=0;i<cur.N;i++){const tg=st.panel&&i===st.sel?1:i===ci?.35:0;cur.uS.value[i]+=(tg-cur.uS.value[i])*k}
 if(st.phase==='on')st.dollyT=st.panel&&!panelSide()?(innerWidth<768?2.2:1.5):0; // with a bottom sheet the open card steps back to fit the space above it
 st.pk+=((st.panel?1:0)-st.pk)*(1-Math.exp(-dt*(reduce?14:7)));cur.uP.value=st.pk;
 if(!st.drag)st.view+=(st.viewT-st.view)*(1-Math.exp(-dt*(reduce?12:4.2)));st.dolly+=(st.dollyT-st.dolly)*(1-Math.exp(-dt*2.2))}
// View offset: with the panel open, the 3D view re-centres the open card in the space the panel leaves free.
function panelSide(){return innerWidth>=1024&&innerWidth>innerHeight*1.05}
// Gallery lens: about 64° across in landscape (the centred card plus about one on each side), wider in portrait.
function lens(){const a=innerWidth/innerHeight,v=2*Math.atan(Math.tan(32*Math.PI/180)/a)*180/Math.PI;return clamp(v,40,66)}
function cam(dt){if(!cur)return;const f=lens();if(Math.abs(camera.fov-f)>.01){camera.fov=f;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();U.uScale.value=renderer.getDrawingBufferSize(new THREE.Vector2()).y/(2*Math.tan(f*Math.PI/360))}placeCamera();const k=st.pk;if(k<.002){if(camera.view&&camera.view.enabled)camera.clearViewOffset();return}
 const W=innerWidth,H=innerHeight;if(panelSide()){const pw=Math.max(380,W*.35);camera.setViewOffset(W,H,pw/2*k,0,W,H)}else{const sh=(W<768?.85:.55)*H;camera.setViewOffset(W,H,0,sh/2*k,W,H)}}

// ================= Crystal panel =================
const panel=$('panel'),pArt=$('pArt');
function fillPanel(i){const p=cur.list[i],c=creators[p.creatorId]||{name:'',bio:''};$('pName').textContent=p.title;$('pCat').textContent=cur.cat.name;$('pPrice').textContent=price(p)+(p.price.amount>0?' · one-time':'');
 $('pDesc').textContent=p.description;$('pCreator').textContent=c.name;$('pBio').textContent=c.bio;$('pCrest').textContent=c.name.split(' ').filter(w=>/^[A-Z]/.test(w)).map(w=>w[0]).slice(0,2).join('');
 const tg=$('pTags');tg.textContent='';for(const t of p.tags||[]){const s=document.createElement('span');s.textContent=t;tg.appendChild(s)}
 const ctx=pArt.getContext('2d');art(ctx,0,0,pArt.width,pArt.height,p.art,i*7+3)}
function open(i){if(!cur||st.phase!=='on'||i<0||i>=cur.N)return;st.viewT=i;st.sel=i;fillPanel(i);updateBar();st.lastInput=performance.now();
 if(!st.panel){st.panel=true;panel.classList.add('on');panel.setAttribute('aria-hidden','false');document.body.classList.add('panel-open');try{history.pushState({usiP:cur.list[i].id},'','#p='+cur.list[i].id)}catch(e){}}
 else try{history.replaceState({usiP:cur.list[i].id},'','#p='+cur.list[i].id)}catch(e){}
 setTimeout(()=>{try{$('pClose').focus({preventScroll:true})}catch(e){}},60)}
function closePanel(silent){if(!st.panel)return;st.panel=false;st.lastInput=performance.now();panel.classList.remove('on');panel.setAttribute('aria-hidden','true');document.body.classList.remove('panel-open');
 if(history.state&&history.state.usiP){st.skipPop=true;history.back()}else if(!silent)try{history.replaceState(null,'','#'+cur.cat.id+'/gallery')}catch(e){}
 try{renderer.domElement.focus({preventScroll:true})}catch(e){}}
addEventListener('popstate',()=>{if(st.skipPop){st.skipPop=false;return}if(st.panel){st.panel=false;panel.classList.remove('on');panel.setAttribute('aria-hidden','true');document.body.classList.remove('panel-open')}});
$('pClose').addEventListener('click',()=>closePanel());
$('pExplore').addEventListener('click',()=>MK.toast('Product pages arrive in a later phase.'));
$('pProfile').addEventListener('click',()=>MK.toast('Creator profiles arrive in a later phase.'));
// Phone sheet: drag the handle down to close.
{let y0=null;const gr=$('pGrab');gr.addEventListener('pointerdown',e=>{y0=e.clientY;try{gr.setPointerCapture(e.pointerId)}catch(_){}});gr.addEventListener('pointerup',e=>{if(y0!=null&&e.clientY-y0>60)closePanel();y0=null});gr.addEventListener('click',()=>closePanel())}
$('gBack').addEventListener('click',exit);$('gPrev').addEventListener('click',()=>step(-1));$('gNext').addEventListener('click',()=>step(1));$('gOpen').addEventListener('click',()=>open(Math.round(st.viewT)));

// ================= Input inside the gallery =================
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();let ptr=null;
function pick(x,y){ndc.set(x/innerWidth*2-1,-(y/innerHeight)*2+1);ray.setFromCamera(ndc,camera);const h=ray.intersectObject(cur.cards,false);return h.length?h[0].instanceId:-1}
function pointer(e){if(!cur||st.phase!=='on')return;const per=Math.max(160,innerWidth*.2);
 if(e.type==='pointerdown'){if(ptr)return;ptr={id:e.pointerId,x:e.clientX,sx:e.clientX,sy:e.clientY,t:performance.now(),v:0,lt:performance.now()};st.lastInput=ptr.t;return}
 if(e.type==='pointermove'){if(!ptr||e.pointerId!==ptr.id){if(e.pointerType==='mouse')renderer.domElement.style.cursor=pick(e.clientX,e.clientY)>=0?'pointer':'grab';return}
  const dx=e.clientX-ptr.x,now=performance.now();ptr.x=e.clientX;if(Math.abs(ptr.x-ptr.sx)>8&&!st.panel){st.drag=true;st.view=clamp(st.view-dx/per,-.4,cur.N-.6);ptr.v=-dx/per/Math.max(1,now-ptr.lt)*1000;ptr.lt=now;st.viewT=st.view}st.lastInput=now;return}
 if(!ptr||e.pointerId!==ptr.id)return;const dx=e.clientX-ptr.sx,dy=e.clientY-ptr.sy,tap=Math.hypot(dx,dy)<10&&performance.now()-ptr.t<450,v=ptr.v;ptr=null;st.lastInput=performance.now();
 if(st.drag){st.drag=false;st.viewT=clamp(Math.round(st.view+clamp(v,-6,6)*.18),0,cur.N-1);updateBar();if(st.panel){st.sel=Math.round(st.viewT);fillPanel(st.sel)}return}
 if(e.type!=='pointerup')return;
 if(tap){const i=pick(e.clientX,e.clientY);if(i>=0)open(i);else if(st.panel)closePanel()}
 else if(st.panel&&Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.6)step(dx<0?1:-1)}
function key(e){if(st.phase!=='on')return;const k=e.key;
 if(k==='ArrowRight'){step(1);e.preventDefault()}else if(k==='ArrowLeft'){step(-1);e.preventDefault()}
 else if(k==='Escape'){if(st.panel)closePanel();else exit()}
 else if(k==='Enter'&&!st.panel&&(document.activeElement===renderer.domElement||document.activeElement===document.body))open(Math.round(st.viewT))}

return {enter,exit,update,camera:cam,pointer,key,open,close:()=>closePanel(),step,
 openWhenReady:id=>{st.pending=id},
 built:()=>built.size>0,textureBytes:()=>{let b=0;for(const g of built.values())b+=g.bytes;return b},
 idle:()=>st.panel&&st.phase==='on'&&st.pk>.995&&!st.drag&&Math.abs(st.view-st.viewT)<.002&&performance.now()-st.lastInput>700,
 state:()=>({phase:st.phase,view:st.view,viewT:st.viewT,panel:st.panel,sel:st.sel,buildMs:cur?cur.buildMs:null,firstOpenMs:st.firstOpenMs||null,n:cur?cur.N:0}),
 resize:()=>{}};
};
