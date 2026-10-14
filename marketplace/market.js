/* Use Superintelligence: Creator Marketplace. Phase 1: atrium, sapphire crystal, six portals.
   Phase 2: the AI Agents product gallery, loaded from marketplace/gallery.js only when first needed.
   Plain Three.js r128, same stack as index.html. Self-contained: shares no code or state with the brain page. */
(function(){'use strict';
const $=id=>document.getElementById(id);
function fail(m){const e=$('error');e.textContent=m;e.style.display='grid';$('veil').style.opacity=0}
if(!window.THREE){fail('The marketplace needs an internet connection to load. Please refresh.');return}

// ================= Setup and quality tiers =================
const qs=location.search;
const coarse=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches);
const reduceMotion=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const motion=reduceMotion?.3:1;
// high: desktop. med: iPad / phones. low: forced (?q=low) or reached by the automatic ladder.
const TIERS={high:{dpr:1.75,bloom:true,mirror:.5,sky:1024,dust:900,aa:4},med:{dpr:1.5,bloom:true,mirror:.33,sky:1024,dust:600,aa:2},low:{dpr:1,bloom:false,mirror:0,sky:512,dust:320,aa:0}};
const forced=(qs.match(/[?&]q=(high|med|low)/)||[])[1];
const tierName=forced||(coarse?'med':'high');
const tier=Object.assign({},TIERS[tierName]);
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,powerPreference:'high-performance'})}catch(e){fail('3D graphics are not available in this browser.');return}
let dpr=Math.min(devicePixelRatio||1,tier.dpr);
renderer.setPixelRatio(dpr);renderer.setSize(innerWidth,innerHeight);
renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.setClearColor('#070914',1);renderer.info.autoReset=false;
const scene=new THREE.Scene();
const world=new THREE.Group();scene.add(world); // everything that appears in the floor reflection
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,3000);
const H=[0,0,0,0,0,0,.35]; // hover/awake level per portal (0-5) and the crystal (6)
const U={uT:{value:0},uHov:{value:H},uScale:{value:800},uGold:{value:1}}; // uGold: portal gold glow level, eased down when the camera is close to a portal
const clamp=(x,a,b)=>Math.min(Math.max(x,a),b);
const _v=new THREE.Vector3(),_w=new THREE.Vector3(),_v2=new THREE.Vector2();

// Layout, in metres. Portals stand on an arc behind the crystal, like the approved atrium art.
const R=17,PLAT=1.0,WI=4.2,HS=5.0,WO=5.3,TOP=HS+WI/2;
const ANG=[-82,-52,-22,22,52,82].map(a=>a*Math.PI/180);
const GLY_Y=PLAT+3.6,GLY_Z=.9;
const GALLERY_READY='agents'; // Phase 2 builds this one gallery only
const CATS=[
 {id:'agents',short:'AI Agents',name:'AI Agents',line:'Autonomous assistants that research, write, plan and work for you.'},
 {id:'tools',short:'AI Tools',name:'AI Tools & Automation',line:'Workflows, bots and integrations that run on their own.'},
 {id:'prompts',short:'Prompts',name:'Prompts & Templates',line:'Ready-made prompts, packs and starters for every task.'},
 {id:'art',short:'Digital Art',name:'Digital Art & Creative Assets',line:'Images, brushes, 3D models, fonts and design kits.'},
 {id:'courses',short:'Courses',name:'Courses & Education',line:'Learn AI, creative and business skills from creators.'},
 {id:'software',short:'Software',name:'Software & Digital Products',line:'Apps, plugins, code and downloadable products.'}];
const onCircle=(th,r,y)=>new THREE.Vector3(Math.sin(th)*r,y,-Math.cos(th)*r);
const portalObj=ANG.map(th=>{const o=new THREE.Object3D();o.position.copy(onCircle(th,R,0));o.lookAt(0,0,0);o.updateMatrix();o.updateMatrixWorld(true);return o});

// ================= Shared helpers =================
const merge=g=>THREE.BufferGeometryUtils.mergeBufferGeometries(g); // keep `this` bound: r128 calls this.mergeBufferAttributes inside
function prep(g,m,pi){if(g.index)g=g.toNonIndexed();for(const k of Object.keys(g.attributes))if(k!=='position'&&k!=='normal'&&k!=='uv')g.deleteAttribute(k);
 if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
 if(m)g.applyMatrix4(m);g.setAttribute('aPortal',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(pi==null?6:pi),1));g.clearGroups();return g}
function perPortal(make){const list=[];portalObj.forEach((o,i)=>list.push(prep(make(i),o.matrix,i)));return merge(list)}
function bary(g){if(g.index)g=g.toNonIndexed();const n=g.attributes.position.count,b=new Float32Array(n*3);for(let i=0;i<n;i++)b[i*3+(i%3)]=1;g.setAttribute('aBary',new THREE.BufferAttribute(b,3));return g}
const HASH='float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}\nfloat h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n';
const HOVV='attribute float aPortal;uniform float uHov[7];varying float vH;\n';
function sMat(o){const add=!!o.additive,p=Object.assign({uniforms:{}},o);delete p.additive;const m=new THREE.ShaderMaterial(p);if(add){m.blending=THREE.AdditiveBlending;m.transparent=true;m.depthWrite=false}return m}
function addU(extra){return Object.assign({uT:U.uT,uHov:U.uHov},extra||{})}
const basic=(c,k)=>new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(k||1),toneMapped:false});
const addBasic=(c,k,op)=>new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(k||1),toneMapped:false,transparent:true,opacity:op==null?1:op,blending:THREE.AdditiveBlending,depthWrite:false});
const lineMat=(c,op)=>new THREE.LineBasicMaterial({color:c,transparent:true,opacity:op,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
const goldMetal=new THREE.MeshStandardMaterial({color:'#C9A060',metalness:.9,roughness:.3,envMapIntensity:1.4,emissive:'#2A1C08',emissiveIntensity:.6});
const portalGold=goldMetal.clone(),goldBase=portalGold.color.clone(); // same gold; only its reflection and glow strength follow U.uGold
const darkMetal=new THREE.MeshStandardMaterial({color:'#1B2244',metalness:.7,roughness:.36,envMapIntensity:1.2});

// ================= Sky: painted once into a cube map (one cheap draw per frame) =================
const SKY_FS=HASH+`
varying vec3 vD;
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n3(p);p*=2.03;a*=.5;}return v;}
float stars(vec3 d,float sc,float th){vec3 p=d*sc;vec3 i=floor(p),f=fract(p)-.5;float h=h3(i);if(h<th)return 0.;vec3 o=vec3(h3(i+3.1),h3(i+7.7),h3(i+1.3))-.5;float r=length(f-o*.55);return smoothstep(.09+.12*(h-th)/(1.-th),0.,r)*(.35+.65*h);}
vec3 galaxy(vec3 d,vec3 c,vec3 ax,float s,float tilt,vec3 col){float k=dot(d,c);if(k<.85)return vec3(0.);vec3 u=normalize(cross(c,ax)),v=cross(c,u);vec2 q=vec2(dot(d,u),dot(d,v))/s;q.y*=tilt;float r=length(q);float a=atan(q.y,q.x);
 float arm=pow(.5+.5*cos(2.*a-log(r+.002)*5.2),3.);float g=exp(-r*r*7.)*.9+arm*exp(-r*2.6)*smoothstep(0.,.12,r)*.75;g*=.65+.7*n3(d*140.);
 return col*g+vec3(1.,.86,.95)*exp(-r*r*90.)*1.3;}
void main(){vec3 d=normalize(vD);float y=d.y;
 vec3 c=mix(vec3(.04,.07,.2),vec3(.012,.016,.048),smoothstep(0.,.55,y));
 c+=vec3(.13,.3,.85)*pow(max(0.,1.-abs(y-.025)*2.2),22.)*.75;
 float n=fbm(d*2.1+3.),n2=fbm(d*4.8+9.);
 c+=vec3(.26,.11,.55)*pow(n,3.2)*.75+vec3(.06,.17,.55)*pow(n2,3.)*.45;
 c+=vec3(.78,.87,1.)*(stars(d,80.,.92)*1.1+stars(d,190.,.95)*.75+stars(d,420.,.965)*.55)*(.55+.9*n);
 c+=galaxy(d,normalize(vec3(-.58,.4,-.71)),vec3(0,1,0),.085,2.4,vec3(.62,.32,.95));
 c+=galaxy(d,normalize(vec3(.66,.38,-.65)),vec3(.3,1,.1),.11,2.2,vec3(.5,.38,1.));
 c+=galaxy(d,normalize(vec3(.06,.93,-.36)),vec3(1,0,0),.10,1.9,vec3(.62,.36,.95));
 if(y<0.)c*=.2+.8*smoothstep(-.06,0.,y);
 gl_FragColor=vec4(c,1.);}`;
function bakeSky(){
 const sk=new THREE.Scene();
 sk.add(new THREE.Mesh(new THREE.SphereGeometry(900,48,24),sMat({side:THREE.BackSide,depthWrite:false,vertexShader:'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:SKY_FS})));
 const pv='varying vec3 vN,vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}';
 const pf=HASH+'uniform vec3 uA,uB;varying vec3 vN,vW;void main(){vec3 N=normalize(vN),V=normalize(cameraPosition-vW);float l=max(dot(N,normalize(vec3(.75,.35,.55))),0.);float b=sin(vW.x*.05+vW.z*.031)*.5+.5;vec3 c=mix(uA,uB,.5+.5*sin(vW.y*.12+b*3.))*l*.85;c+=vec3(.25,.55,1.)*pow(1.-abs(dot(N,V)),3.5)*.9;gl_FragColor=vec4(c,1.);}';
 for(const [d,r,a,b] of [[[-.62,.3,-.72],44,'#0B1336','#3B4E86'],[[.6,.17,-.78],20,'#101A40','#5468A8'],[[-.3,.24,-.92],8,'#14214D','#7C8FD0']]){
  const m=new THREE.Mesh(new THREE.SphereGeometry(r,48,32),sMat({uniforms:{uA:{value:new THREE.Color(a)},uB:{value:new THREE.Color(b)}},vertexShader:pv,fragmentShader:pf}));m.position.set(...d).normalize().multiplyScalar(380);sk.add(m)}
 // Distant rocky ridges with a cold rim light, as in the art.
 const N=360,pos=[],uv=[],idx=[];for(let i=0;i<=N;i++){const a=i/N*Math.PI*2,t=13+5*Math.sin(a*3.1)+3.5*Math.sin(a*7.3+1.)+2.2*Math.abs(Math.sin(a*23.+2.))+1.2*Math.sin(a*61.);
  pos.push(Math.sin(a)*300,-60,-Math.cos(a)*300,Math.sin(a)*300,t,-Math.cos(a)*300);uv.push(0,0,0,1);if(i<N){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}}
 const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));rg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));rg.setIndex(idx);
 sk.add(new THREE.Mesh(rg,sMat({side:THREE.DoubleSide,vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vU;void main(){vec3 c=vec3(.012,.016,.035)+vec3(.12,.28,.7)*pow(vU.y,26.)*.9;gl_FragColor=vec4(c,1.);}'})));
 const rt=new THREE.WebGLCubeRenderTarget(tier.sky,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});rt.texture.encoding=THREE.sRGBEncoding;
 const cc=new THREE.CubeCamera(1,2000,rt);cc.position.set(0,6,0);sk.add(cc);cc.update(renderer,sk);
 sk.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()});
 scene.background=rt.texture;
 const pm=new THREE.PMREMGenerator(renderer);scene.environment=pm.fromCubemap(rt.texture).texture;pm.dispose()}
bakeSky();

// Lights: warm key for the gold, cool fill and a sapphire point light from the crystal.
scene.add(new THREE.HemisphereLight('#4A63B8','#080B1C',.55));
{const k=new THREE.DirectionalLight('#FFD9A0',1.35);k.position.set(-6,22,20);scene.add(k);const f=new THREE.DirectionalLight('#7FB8FF',.45);f.position.set(10,8,-20);scene.add(f)}
const crystalLight=new THREE.PointLight('#6FD2FF',2.4,34,1.6);crystalLight.position.set(0,5,0);scene.add(crystalLight);

// ================= Mirror floor =================
const mirCam=new THREE.PerspectiveCamera();mirCam.layers.set(1);
const atriumOnly=[]; // scene-level atrium parts hidden inside a gallery
let mirRT=null;const texM=new THREE.Matrix4(),BIAS=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
const floorU={uT:U.uT,uHov:U.uHov,uIn:{value:0},uMir:{value:null},uMirOn:{value:0},uTexM:{value:texM},uTexel:{value:new THREE.Vector2(1/512,1/512)},uPortal:{value:ANG.map(th=>new THREE.Vector2(Math.sin(th)*(R-2.2),-Math.cos(th)*(R-2.2)))}};
function setMirror(s){tier.mirror=s;if(mirRT){mirRT.dispose();mirRT=null}floorU.uMirOn.value=s>0?1:0;floorU.uMir.value=null;if(s>0){const sz=renderer.getDrawingBufferSize(_v2);mirRT=new THREE.WebGLRenderTarget(Math.max(2,Math.round(sz.x*s)),Math.max(2,Math.round(sz.y*s)));mirRT.texture.encoding=THREE.sRGBEncoding;floorU.uMir.value=mirRT.texture;floorU.uTexel.value.set(1/mirRT.width,1/mirRT.height)}}
{
 const fl=new THREE.Mesh(new THREE.CircleGeometry(70,96).rotateX(-Math.PI/2),sMat({uniforms:floorU,
  vertexShader:'uniform mat4 uTexM;varying vec3 vW;varying vec4 vM;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vM=uTexM*w;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:HASH+`uniform sampler2D uMir;uniform float uMirOn,uT,uHov[7],uIn;uniform vec2 uTexel,uPortal[6];varying vec3 vW;varying vec4 vM;
  float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}
  void main(){vec2 p=vW.xz;float r=length(p);
   vec3 c=vec3(.014,.018,.04);
   vec2 tid=floor(p/3.4);c*=.85+.3*h2(tid);
   vec2 g=abs(fract(p/3.4)-.5);float seam=smoothstep(.484,.497,max(g.x,g.y));
   float vn1=vn(p*.55+tid*.37),vein=1.-smoothstep(0.,.035,abs(vn1-.5));c+=vec3(.42,.3,.12)*vein*.06*(1.-seam);
   float fade=smoothstep(62.,22.,r);
   if(uMirOn>.5){vec2 uv=vM.xy/vM.w;vec2 o=uTexel*2.;vec3 m=texture2D(uMir,uv).rgb*.4+(texture2D(uMir,uv+vec2(o.x,o.y)).rgb+texture2D(uMir,uv-vec2(o.x,o.y)).rgb+texture2D(uMir,uv+vec2(o.x,-o.y)).rgb+texture2D(uMir,uv-vec2(o.x,-o.y)).rgb)*.15;
    c+=m*.7*(1.-seam*.7)*fade;}
   float atr=1.-uIn; // dais and portal light pools belong to the atrium only
   c+=vec3(.14,.38,.95)*exp(-max(r-5.2,0.)*.42)*(.16+.12*uHov[6])*atr;
   for(int i=0;i<6;i++){float d=distance(p,uPortal[i]);c+=vec3(.1,.32,.95)*exp(-d*d*.09)*(.16+.3*uHov[i])*atr;}
   c+=vec3(.9,.65,.3)*seam*.035*smoothstep(16.,7.,r);
   c*=mix(.25,1.,fade);
   gl_FragColor=vec4(c,1.);}`}));
 scene.add(fl);
 // Inlaid light rings around the dais (floor level, so they stay out of the reflection pass).
 for(const [a,b,col,k,op] of [[6.55,6.63,'#F0C674',1.3,.9],[8.35,8.47,'#F0C674',1.6,1],[10.55,10.6,'#7FE0FF',1.1,.7],[12.9,12.94,'#F0C674',.8,.5]]){
  const m=new THREE.Mesh(new THREE.RingGeometry(a,b,160).rotateX(-Math.PI/2),addBasic(col,k,op));m.position.y=.012;scene.add(m);atriumOnly.push(m)}
}

// ================= Portals (static parts merged: one draw call per material) =================
function archShape(w,hs){const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(-w/2,hs);s.absarc(0,hs,w/2,Math.PI,0,true);s.lineTo(w/2,0);s.lineTo(-w/2,0);return s}
function bandShape(wo,wi,hs){const s=new THREE.Shape();s.moveTo(-wo/2,0);s.lineTo(-wo/2,hs);s.absarc(0,hs,wo/2,Math.PI,0,true);s.lineTo(wo/2,0);s.lineTo(wi/2,0);s.lineTo(wi/2,hs);s.absarc(0,hs,wi/2,0,Math.PI,false);s.lineTo(-wi/2,0);s.lineTo(-wo/2,0);return s}
function archCurve(w,hs,y0,z){const pts=[],r=w/2;for(let i=0;i<=6;i++)pts.push(new THREE.Vector3(-r,y0+(hs-y0)*i/6,z));for(let i=1;i<32;i++){const a=Math.PI-Math.PI*i/32;pts.push(new THREE.Vector3(Math.cos(a)*r,hs+Math.sin(a)*r,z))}for(let i=0;i<=6;i++)pts.push(new THREE.Vector3(r,hs-(hs-y0)*i/6,z));return new THREE.CatmullRomCurve3(pts,false,'centripetal')}
const V_HOV='uniform float uHov[7];attribute float aPortal;varying float vH;varying vec2 vU;void main(){vU=uv;vH=uHov[int(aPortal+.5)];gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const noseMat=basic('#F0C674',1.25),lampMat=basic('#FFE6B5',1.7),noseBase=noseMat.color.clone(),lampBase=lampMat.color.clone();
// Frames: gold metal arch with a bevel, standing on dark platforms with glowing gold stair noses.
world.add(new THREE.Mesh(perPortal(()=>new THREE.ExtrudeGeometry(bandShape(WO,WI,HS),{depth:.55,bevelEnabled:true,bevelSize:.06,bevelThickness:.06,bevelSegments:2,curveSegments:32}).translate(0,PLAT,-.3)),portalGold));
world.add(new THREE.Mesh(perPortal(()=>{const L=[new THREE.BoxGeometry(6.6,PLAT,3.2).translate(0,PLAT/2,.7)];for(let k=0;k<3;k++){const h=PLAT*(3-k)/3-.0;L.push(new THREE.BoxGeometry(5.2-k*.3,h,.5).translate(0,h/2,2.55+k*.5))}return merge(L.map(g=>prep(g)))}),darkMetal));
world.add(new THREE.Mesh(perPortal(()=>{const L=[new THREE.BoxGeometry(6.62,.05,.05).translate(0,PLAT,2.3)];for(let k=0;k<3;k++){const h=PLAT*(3-k)/3;L.push(new THREE.BoxGeometry(5.2-k*.3,.04,.05).translate(0,h,2.8+k*.5))}return merge(L.map(g=>prep(g)))}),noseMat));
// Inner panels: deep blue energy with a central beam, edge glow and drifting stars.
world.add(new THREE.Mesh(perPortal(()=>new THREE.ShapeGeometry(archShape(WI,HS),32).translate(0,PLAT,-.05)),sMat({uniforms:addU(),vertexShader:'uniform float uHov[7];attribute float aPortal;varying float vH;varying vec2 vP;void main(){vP=uv;vH=uHov[int(aPortal+.5)];gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:HASH+`uniform float uT;varying float vH;varying vec2 vP;
 void main(){float hw=${(WI/2).toFixed(3)},hs=${HS.toFixed(3)},top=${TOP.toFixed(3)};float y=vP.y/top;
  float d=vP.y<hs?hw-abs(vP.x):hw-length(vec2(vP.x,vP.y-hs));
  vec3 c=mix(vec3(.015,.04,.17),vec3(.03,.1,.4),smoothstep(1.,0.,y));
  c+=vec3(.12,.38,1.)*exp(-d*3.)*(.55+.4*vH);
  c+=vec3(.45,.78,1.)*exp(-abs(vP.x)*10.)*(.32+.45*vH)*(.7+.3*sin(y*18.-uT*2.2));
  c+=vec3(.25,.55,1.)*exp(-y*6.5)*(.55+.55*vH);
  float n=sin(vP.x*3.1+uT*.4)*sin(vP.y*2.3-uT*.3)+sin((vP.x+vP.y)*1.7+uT*.25);c+=vec3(.04,.09,.3)*(.5+.25*n);
  vec2 g=vP*6.5;vec2 id=floor(g);float s=h2(id);vec2 f=fract(g)-.5;c+=vec3(.7,.86,1.)*step(.9,s)*smoothstep(.12,0.,length(f))*(.5+.5*sin(uT*2.+s*40.))*.8;
  gl_FragColor=vec4(c*(.85+.35*vH),1.);}`})));
// Neon: a bright aether line inside the frame, a softer signal-blue line and a gold line of light on the outer edge.
function neonMesh(w,z,rad,c,base,y0,gold){return new THREE.Mesh(perPortal(()=>new THREE.TubeGeometry(archCurve(w,HS,y0,z),160,rad,6,false).translate(0,PLAT,0)),sMat({additive:true,uniforms:addU({uC:{value:new THREE.Color(c)},uB:{value:base},uG:gold?U.uGold:{value:1}}),vertexShader:V_HOV,
 fragmentShader:'uniform vec3 uC;uniform float uB,uT,uG;varying float vH;varying vec2 vU;void main(){float p=pow(fract(vU.x*2.-uT*.22),14.);gl_FragColor=vec4((uC*(uB+.3*vH)+uC*p*(.4+.7*vH))*uG,1.);}'}))}
world.add(neonMesh(WI-.06,.12,.05,'#7FE0FF',1.25,0),neonMesh(WI-.42,.05,.022,'#3D7BFF',.75,.15),neonMesh(WO+.02,.3,.03,'#F0C674',.85,0,true));
// Emitter discs at the base of each portal.
const DISC_FS='uniform float uT;varying float vH;varying vec2 vU;void main(){float r=length(vU-.5)*2.;if(r>1.)discard;float sp=1.5+2.5*vH;'+
 'float c=pow(.5+.5*sin(r*30.-uT*sp),6.)*.35*(1.-r)+exp(-abs(r-.93)*34.)*1.1+exp(-abs(r-.62)*46.)*.65+exp(-r*3.2)*.45;'+
 'vec3 col=vec3(.3,.66,1.)*c*(.75+.75*vH)+vec3(1.,.78,.42)*exp(-abs(r-.985)*70.)*.8;gl_FragColor=vec4(col,1.);}';
world.add(new THREE.Mesh(perPortal(()=>new THREE.CircleGeometry(2.05,64).rotateX(-Math.PI/2).translate(0,PLAT+.02,.95)),sMat({additive:true,uniforms:addU(),vertexShader:V_HOV,fragmentShader:DISC_FS})));
// Lamps at the crown of each arch.
world.add(new THREE.Mesh(perPortal(()=>new THREE.SphereGeometry(.2,16,10).translate(0,PLAT+HS+WO/2+.22,.15)),lampMat));

// Rising light particles inside the portals, and soft glow points (lamps, glyphs, orbs).
const PTS_VS='uniform float uHov[7],uScale,uT,uGold;attribute float aPortal,aSize,aSeed;attribute vec3 aColor;varying vec3 vC;varying float vA;';
const PTS_FS='varying vec3 vC;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=dot(c,c)*4.;if(d>1.)discard;gl_FragColor=vec4(vC*exp(-d*4.5)*vA,1.);}';
function points(arr,vs){const n=arr.length,P=new Float32Array(n*3),C=new Float32Array(n*3),S=new Float32Array(n),D=new Float32Array(n),I=new Float32Array(n);
 arr.forEach((p,i)=>{P.set(p.p,i*3);C.set(p.c,i*3);S[i]=p.s;D[i]=p.seed==null?Math.random():p.seed;I[i]=p.i==null?6:p.i});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('aColor',new THREE.BufferAttribute(C,3));g.setAttribute('aSize',new THREE.BufferAttribute(S,1));g.setAttribute('aSeed',new THREE.BufferAttribute(D,1));g.setAttribute('aPortal',new THREE.BufferAttribute(I,1));
 const o=new THREE.Points(g,sMat({additive:true,uniforms:{uT:U.uT,uHov:U.uHov,uScale:U.uScale,uGold:U.uGold},vertexShader:PTS_VS+vs,fragmentShader:PTS_FS}));o.frustumCulled=false;return o}
{const glow=[],rise=[];const lamp=new THREE.Vector3();
 portalObj.forEach((o,i)=>{lamp.set(0,PLAT+HS+WO/2+.22,.15).applyMatrix4(o.matrix);glow.push({p:lamp.toArray(),c:[1.,.72,.35],s:1.6,i,seed:2}); // seed 2 marks a gold lamp glow
  _v.set(0,GLY_Y,GLY_Z).applyMatrix4(o.matrix);glow.push({p:_v.toArray(),c:[.07,.18,.48],s:4.2,i});
  _v.set(0,PLAT+.25,1.0).applyMatrix4(o.matrix);glow.push({p:_v.toArray(),c:[.12,.3,.8],s:4.5,i});
  for(let k=0;k<70;k++){_v.set((Math.random()-.5)*3.4,0,.2+Math.random()*.6).applyMatrix4(o.matrix);rise.push({p:_v.toArray(),c:Math.random()<.2?[1.,.8,.45]:[.5,.82,1.],s:.05+Math.random()*.07,i})}});
 world.add(points(glow,'void main(){float h=uHov[int(aPortal+.5)];vC=aColor;vA=(1.+h*.9)*(aSeed>1.5?uGold:1.);vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*(1.+.2*h)*uScale/-mv.z;gl_Position=projectionMatrix*mv;}'));
 world.add(points(rise,`void main(){float h=uHov[int(aPortal+.5)];float span=${(TOP-.4).toFixed(2)};float y=mod(aSeed*span+uT*(.25+.5*h)*(.6+aSeed),span);vec3 p=position;p.y=${PLAT.toFixed(2)}+y;p.x+=sin(uT*.7+aSeed*30.)*.06;
  vC=aColor;vA=(.45+.9*h)*smoothstep(0.,.6,y)*smoothstep(span,span-1.5,y)*(.6+.4*sin(uT*3.+aSeed*50.));vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=aSize*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`))}

// ================= Hall: columns, ceiling rings and ribs =================
{const COLS=[0,37,67,97,-37,-67,-97].map(a=>a*Math.PI/180),CR=R+.6,CH=19.5;
 const colG=[],bandG=[],ribG=[];
 for(const th of COLS){const p=onCircle(th,CR,0);colG.push(prep(new THREE.CylinderGeometry(.5,.66,CH,18).translate(p.x,CH/2,p.z)));colG.push(prep(new THREE.CylinderGeometry(.9,.9,.5,18).translate(p.x,.25,p.z)));colG.push(prep(new THREE.CylinderGeometry(.85,.55,.7,18).translate(p.x,CH-.3,p.z)));
  for(const y of [1.6,7.2,13.4])bandG.push(prep(new THREE.TorusGeometry(.6,.045,6,28).rotateX(Math.PI/2).translate(p.x,y,p.z)));
  const a=onCircle(th,CR,CH),c=onCircle(th,12.5,CH+3.4),b=onCircle(th,7.4,CH+1.9);ribG.push(prep(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a,c,b),28,.17,8,false)))}
 colG.push(prep(new THREE.TorusGeometry(CR,.38,10,160).rotateX(Math.PI/2).translate(0,CH,0)));
 ribG.push(prep(new THREE.TorusGeometry(7.4,.22,10,128).rotateX(Math.PI/2).translate(0,CH+1.9,0)));
 world.add(new THREE.Mesh(merge(colG),darkMetal),new THREE.Mesh(merge(ribG),goldMetal),new THREE.Mesh(merge(bandG),basic('#F0C674',1.05)));
 const ring=(r,y,t,c,k)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(r,t,6,160).rotateX(Math.PI/2),basic(c,k));m.position.y=y;world.add(m)};
 ring(6.9,CH+1.95,.05,'#7FE0FF',1.5);ring(7.85,CH+1.9,.035,'#F0C674',1.4);ring(CR-.45,CH-.1,.04,'#F0C674',1.2);ring(CR-.5,CH-.45,.03,'#7FE0FF',.9);
 // Small lights along the great ring.
 const lights=[];for(let i=0;i<84;i++){const a=i/84*Math.PI*2;lights.push({p:[Math.sin(a)*(CR-.4),CH-.28,-Math.cos(a)*(CR-.4)],c:[1.,.75,.38],s:.55})}
 world.add(points(lights,'void main(){vC=aColor;vA=.75+.25*sin(uT*1.5+aSeed*20.);vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uScale/-mv.z;gl_Position=projectionMatrix*mv;}'))}

// ================= Dais =================
{const tiers=[[5.2,.3,0],[4.0,.3,.3],[2.9,.4,.6]];const g=[];for(const [r,h,y] of tiers)g.push(prep(new THREE.CylinderGeometry(r,r+.06,h,72).translate(0,y+h/2,0)));world.add(new THREE.Mesh(merge(g),darkMetal));
 const rim=(r,y,c,k,t)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(r,t||.035,6,160).rotateX(Math.PI/2),basic(c,k));m.position.y=y;world.add(m)};
 rim(5.21,.3,'#F0C674',1.35);rim(4.01,.6,'#7FE0FF',1.4);rim(2.91,1.0,'#F0C674',1.5);rim(4.6,.31,'#3D7BFF',1.1,.02);
 const top=prep(new THREE.CircleGeometry(2.75,72).rotateX(-Math.PI/2).translate(0,1.012,0));world.add(new THREE.Mesh(top,sMat({additive:true,uniforms:addU(),vertexShader:V_HOV,fragmentShader:DISC_FS})))}

// ================= Central sapphire crystal =================
const CRYS_FS=HASH+`uniform float uT,uH;varying vec3 vB,vN,vW;varying float vY;
vec3 env(vec3 r){vec3 c=mix(vec3(.02,.03,.1),vec3(.1,.2,.5),smoothstep(-.3,.5,r.y));c+=vec3(.5,.75,1.)*pow(max(0.,1.-abs(r.y-.1)*3.),6.)*.55;
 c+=vec3(.85,.93,1.)*step(.975,h3(floor(r*36.)))*.9;c+=vec3(1.,.8,.45)*pow(max(0.,dot(r,normalize(vec3(-.3,.75,.6)))),36.)*1.4;return c;}
void main(){vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;float ndv=clamp(dot(N,V),0.,1.);float fr=pow(1.-ndv,2.2);
 vec3 refl=env(reflect(-V,N));vec3 T=refract(-V,N,.66);float fid=h3(floor(N*7.)+.5);float yn=vY/7.2;
 vec3 deep=mix(vec3(.04,.06,.34),vec3(.24,.17,.74),smoothstep(-.7,.9,T.y+yn*1.4));
 deep+=vec3(.3,.55,1.)*pow(max(0.,1.-abs(T.x)*1.3),3.)*.5;
 deep+=vec3(.75,.88,1.)*step(.982,h3(floor(T*16.+floor(uT*.6))))*1.1;
 deep*=.6+.8*fid;
 deep+=vec3(.45,.78,1.)*pow(.5+.5*sin(yn*10.-uT*1.2+fid*4.),8.)*.4;
 deep+=vec3(.8,.92,1.)*smoothstep(-.05,-.5,yn)*1.1;
 float e=min(min(vB.x,vB.y),vB.z);float edge=1.-smoothstep(0.,.024,e);
 vec3 col=deep+refl*fr*1.15+vec3(.78,.93,1.)*edge*(.55+.7*fr)+vec3(.45,.75,1.)*fr*.45;
 gl_FragColor=vec4(col*(.95+.25*uH),.9);}`;
const CRYS_VS='attribute vec3 aBary;varying vec3 vB,vN,vW;varying float vY;void main(){vB=aBary;vY=position.y;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}';
const crystal=new THREE.Group();crystal.position.set(0,5.25,0);world.add(crystal);
const crystalU={uT:U.uT,uH:{value:.35}};
{const prof=[[0,-3.6],[1.0,-1.7],[1.75,.3],[1.3,1.9],[.62,3.0],[0,3.75]].map(p=>new THREE.Vector2(p[0],p[1]));
 const gem=bary(new THREE.LatheGeometry(prof,9));gem.computeVertexNormals();
 const core=new THREE.Mesh(bary(new THREE.LatheGeometry(prof,7)).scale(.5,.62,.5),sMat({additive:true,uniforms:{uT:U.uT},vertexShader:CRYS_VS,fragmentShader:HASH+'uniform float uT;varying vec3 vB,vN,vW;varying float vY;void main(){float e=min(min(vB.x,vB.y),vB.z);vec3 c=vec3(.25,.35,1.)*.35+vec3(.6,.85,1.)*(1.-smoothstep(0.,.05,e))*.6+vec3(.9,.95,1.)*pow(.5+.5*sin(vY*3.-uT*1.6),10.)*.5;gl_FragColor=vec4(c,1.);}'}));
 core.renderOrder=1;crystal.add(core);crystal.userData.core=core;
 const gm=new THREE.Mesh(gem,sMat({transparent:true,uniforms:crystalU,vertexShader:CRYS_VS,fragmentShader:CRYS_FS}));gm.renderOrder=2;crystal.add(gm);crystal.userData.gem=gm;
 // Gold orbit rings with travelling sparks.
 crystal.userData.orbits=[];
 for(const [r,tx,tz,sp] of [[3.15,1.32,.26,.22],[2.65,1.78,-.42,-.3],[3.7,1.15,.62,.16]]){const og=new THREE.Group();og.rotation.set(tx,0,tz);crystal.add(og);
  og.add(new THREE.Mesh(new THREE.TorusGeometry(r,.026,6,180),basic('#FFD58A',1.6)));
  const spark=[];for(let i=0;i<40;i++){const a=Math.random()*Math.PI*2;spark.push({p:[Math.cos(a)*r,Math.sin(a)*r,0],c:Math.random()<.7?[1.,.8,.45]:[.6,.9,1.],s:.07+Math.random()*.1})}
  const sp2=points(spark,'void main(){vC=aColor;vA=.6+.4*sin(uT*4.+aSeed*60.);vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uScale/-mv.z;gl_Position=projectionMatrix*mv;}');og.add(sp2);
  crystal.userData.orbits.push({g:og,sp})}}
// Light column from the crystal to the oculus, soft glow behind the crystal and a flare at its base.
const beamMat=w=>sMat({additive:true,uniforms:{uT:U.uT,uW:{value:w}},vertexShader:'varying vec2 vU;varying vec3 vN,vW;void main(){vU=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}',
 fragmentShader:'uniform float uT,uW;varying vec2 vU;varying vec3 vN,vW;void main(){vec3 V=normalize(cameraPosition-vW);float s=pow(abs(dot(normalize(vN),V)),uW);float f=smoothstep(0.,.08,vU.y)*smoothstep(1.,.75,vU.y);float p=.75+.25*sin(vU.y*40.-uT*3.);gl_FragColor=vec4(vec3(.45,.8,1.)*s*f*p*(uW>2.?1.6:.35),1.);}'});
{const h=13.2,y=5.25+3.75;const core=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,h,10,1,true),beamMat(3.));core.position.y=y+h/2-.3;world.add(core);
 const soft=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,h,16,1,true),beamMat(1.5));soft.position.y=y+h/2-.3;world.add(soft)}
const billboards=[];
function glowCard(w,h,col,k,pos,ring){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),sMat({additive:true,uniforms:{uC:{value:new THREE.Color(col).multiplyScalar(k)},uR:{value:ring?1:0}},vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform vec3 uC;uniform float uR;varying vec2 vU;void main(){vec2 q=(vU-.5)*2.;float d=dot(q,q);float g=uR>.5?exp(-d*14.)+exp(-abs(q.y)*24.)*exp(-abs(q.x)*2.5)*.6:exp(-d*3.2)*(1.-smoothstep(.85,1.,d));gl_FragColor=vec4(uC*g,1.);}'}));m.position.copy(pos);world.add(m);billboards.push(m);return m}
glowCard(13,15,'#3D6BFF',.42,new THREE.Vector3(0,5.6,0));
glowCard(7.5,2.4,'#BFE9FF',1.15,new THREE.Vector3(0,1.75,0),true);

// ================= Six category glyphs =================
const GLASS_VS='attribute vec3 aBary;varying vec3 vB,vN,vW;void main(){vB=aBary;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}';
const GLASS_FS=HASH+'uniform vec3 uA,uB;uniform float uH,uT,uE;varying vec3 vB,vN,vW;void main(){vec3 N=normalize(vN),V=normalize(cameraPosition-vW);float fr=pow(1.-abs(dot(N,V)),2.);float fid=h3(floor(N*5.)+.3);'+
 'float e=min(min(vB.x,vB.y),vB.z);float edge=(1.-smoothstep(0.,.03,e))*uE;vec3 c=mix(uA,uB,fid)*(.2+.55*fr)+vec3(.82,.94,1.)*edge*(.85+.7*uH)+uA*.12*(.5+.5*sin(vW.y*6.-uT*2.));gl_FragColor=vec4(c*(.85+.45*uH),1.);}';
const glyphs=[];
function glass(a,b,hU,edges){return sMat({additive:true,side:THREE.DoubleSide,uniforms:{uT:U.uT,uH:hU,uA:{value:new THREE.Color(a)},uB:{value:new THREE.Color(b)},uE:{value:edges===false?0:1}},vertexShader:GLASS_VS,fragmentShader:GLASS_FS})}
const orbGeo=new THREE.SphereGeometry(.085,14,10);
function orbit(parent,r,rot,cols,lineOp){const ring=new THREE.Group();ring.rotation.set(rot[0],rot[1]||0,rot[2]||0);parent.add(ring);
 const pts=[];for(let i=0;i<=120;i++){const a=i/120*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r))}ring.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineMat('#F0C674',lineOp==null?.5:lineOp)));
 const spin=new THREE.Group();ring.add(spin);cols.forEach((c,i)=>{const a=i/cols.length*Math.PI*2;const m=new THREE.Mesh(orbGeo,basic(c==='g'?'#FFD58A':'#8FE6FF',1.7));m.position.set(Math.cos(a)*r,0,Math.sin(a)*r);spin.add(m)});return spin}
function edgeLines(geo,c,op){return new THREE.LineSegments(new THREE.EdgesGeometry(geo),lineMat(c,op))}
const TUBE_FS='uniform vec3 uA,uB;uniform float uH,uT;varying vec2 vU;varying vec3 vN,vW;void main(){vec3 N=normalize(vN),V=normalize(cameraPosition-vW);float fr=pow(1.-abs(dot(N,V)),1.5);float k=.5+.5*sin(vU.x*12.566+uT*.6);vec3 c=mix(uA,uB,k);float p=pow(fract(vU.x*3.-uT*.35),18.);gl_FragColor=vec4((c*(.3+.9*fr)+vec3(1.,.95,.85)*p*(.7+uH))*(.9+.4*uH),1.);}';
const TUBE_VS='varying vec2 vU;varying vec3 vN,vW;void main(){vU=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}';
const BUILD=[
 // 1 AI Agents: faceted crystal core inside three orbits.
 (g,hU)=>{const core=new THREE.Mesh(bary(new THREE.IcosahedronGeometry(.92,0)),glass('#3D7BFF','#9FE3FF',hU));core.scale.y=1.18;g.add(core);
  const inner=new THREE.Mesh(bary(new THREE.IcosahedronGeometry(.4,0)),glass('#7FE0FF','#FFFFFF',hU));g.add(inner);
  const s=[orbit(g,1.55,[1.2,0,.3],['g','b']),orbit(g,1.78,[1.9,0,-.5],['b','g']),orbit(g,1.4,[.45,0,1.2],['g','b'])];
  return (dt,t,h)=>{core.rotation.y+=dt*(.25+.7*h)*motion;inner.rotation.y-=dt*(.4+.6*h)*motion;s.forEach((o,i)=>o.rotation.y+=dt*(.5+.3*i)*(1+h)*motion)}},
 // 2 AI Tools & Automation: two interlocking rings of blue and gold light.
 (g,hU)=>{const m=sMat({additive:true,uniforms:{uT:U.uT,uH:hU,uA:{value:new THREE.Color(.3,.62,1.25)},uB:{value:new THREE.Color(1.15,.76,.36)}},vertexShader:TUBE_VS,fragmentShader:TUBE_FS});
  const a=new THREE.Mesh(new THREE.TorusGeometry(1.08,.1,14,96),m),b=new THREE.Mesh(new THREE.TorusGeometry(1.08,.1,14,96),m);a.rotation.set(1.05,0,.5);b.rotation.set(.25,1.15,-.55);
  for(const [t,c] of [[a,0],[b,1.6],[a,3.4]]){const o=new THREE.Mesh(orbGeo,basic(c>1?'#FFD58A':'#8FE6FF',1.8));o.scale.setScalar(1.25);o.position.set(Math.cos(c)*1.08,Math.sin(c)*1.08,0);t.add(o)}
  const grp=new THREE.Group();grp.add(a,b);g.add(grp);
  return (dt,t,h)=>{a.rotation.z+=dt*(.35+.8*h)*motion;b.rotation.z-=dt*(.3+.7*h)*motion;grp.rotation.y+=dt*.18*motion}},
 // 3 Prompts & Templates: a stack of floating glass tablets.
 (g,hU)=>{const grp=new THREE.Group();grp.rotation.set(.5,.78,0);g.add(grp);const tabs=[];const geo=new THREE.BoxGeometry(1.65,.06,1.2);
  for(let i=0;i<4;i++){const t=new THREE.Group();t.add(new THREE.Mesh(bary(geo.clone()),glass('#3D7BFF','#9FE3FF',hU,false)),edgeLines(geo,i===3?'#FFE2A8':'#CDEFFF',.95));grp.add(t);tabs.push(t)}
  return (dt,t,h)=>{const sp=.36+.06*h+.03*Math.sin(t*1.1);tabs.forEach((m,i)=>{m.position.y=(i-1.5)*sp;m.rotation.y=Math.sin(t*.6+i*.7)*.06});grp.rotation.y+=dt*.2*motion}},
 // 4 Digital Art & Creative Assets: a crystal prism splitting a beam into a spectrum.
 (g,hU)=>{const pr=new THREE.Mesh(bary(new THREE.OctahedronGeometry(.78,0)),glass('#3D7BFF','#9FE3FF',hU));pr.scale.set(.8,1.65,.8);g.add(pr);
  const inBeam=new THREE.Mesh(new THREE.PlaneGeometry(2.1,.045),addBasic('#FFFFFF',1.4,.9));inBeam.position.set(-1.25,-.22,.05);inBeam.rotation.z=.19;g.add(inBeam);
  const N=28,pos=[],uv=[],idx=[],a0=-.36,a1=.16,L=2.35;for(let j=0;j<=N;j++){const v=j/N,a=a0+(a1-a0)*v;pos.push(Math.cos(a)*.12,Math.sin(a)*.12,0,Math.cos(a)*L,Math.sin(a)*L,0);uv.push(0,v,1,v);if(j<N){const k=j*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}}
  const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));fg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));fg.setIndex(idx);
  const fan=new THREE.Mesh(fg,sMat({additive:true,side:THREE.DoubleSide,uniforms:{uT:U.uT,uH:hU},vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:'uniform float uT,uH;varying vec2 vU;vec3 hsv(float h){return clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);}void main(){vec3 c=hsv(.02+vU.y*.74);float a=pow(1.-vU.x,.7)*smoothstep(0.,.12,vU.x)*smoothstep(0.,.08,vU.y)*smoothstep(1.,.92,vU.y);a*=.85+.15*sin(vU.x*30.-uT*3.);gl_FragColor=vec4(c*a*(.9+.5*uH),1.);}'}));
  fan.position.set(.12,-.05,.04);g.add(fan);
  return (dt,t,h)=>{pr.rotation.y+=dt*(.3+.6*h)*motion}},
 // 5 Courses & Education: an open book of light beneath a golden sphere.
 (g,hU)=>{const book=new THREE.Group();book.position.y=-.55;book.rotation.x=.62;g.add(book);
  const pm=sMat({additive:true,side:THREE.DoubleSide,uniforms:{uT:U.uT,uH:hU},vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:'uniform float uT,uH;varying vec2 vU;void main(){float e=smoothstep(.8,1.,vU.x)+smoothstep(.06,0.,vU.y)*.4+smoothstep(.94,1.,vU.y)*.4;vec3 c=vec3(.25,.45,.95)*.1+vec3(.8,.92,1.)*e*.3;gl_FragColor=vec4(c*(.8+.3*uH),1.);}'});
  const pages=[];for(const s of [-1,1])for(let k=0;k<6;k++){const pg=new THREE.PlaneGeometry(1.2,1.45,10,1).rotateX(-Math.PI/2).translate(.6,0,0);const p=pg.attributes.position;
   for(let i=0;i<p.count;i++){const t=p.getX(i)/1.2;p.setY(i,.22*Math.sin(t*Math.PI)*(1.-k*.08))}pg.rotateZ(.2+k*.075);if(s<0)pg.scale(-1,1,1);pages.push(prep(pg))}
  book.add(new THREE.Mesh(merge(pages),pm));
  const sp=new THREE.Mesh(new THREE.SphereGeometry(.42,32,18),sMat({uniforms:{uH:hU},vertexShader:TUBE_VS,fragmentShader:'uniform float uH;varying vec3 vN,vW;void main(){vec3 N=normalize(vN),V=normalize(cameraPosition-vW);float fr=pow(1.-max(dot(N,V),0.),2.);vec3 c=vec3(.42,.24,.07)+vec3(1.,.72,.32)*fr*1.2+vec3(1.,.92,.75)*pow(max(dot(N,normalize(vec3(-.4,.6,.7))),0.),18.)*1.1;gl_FragColor=vec4(c*(.9+.3*uH),1.);}'}));
  sp.position.y=.75;g.add(sp);const s1=orbit(sp,.82,[1.3,0,.25],['g','b','g'],.55);
  return (dt,t,h)=>{s1.rotation.y+=dt*(.6+.8*h)*motion;sp.position.y=.75+Math.sin(t*1.3)*.05}},
 // 6 Software & Digital Products: a cluster of glass cubes.
 (g,hU)=>{const grp=new THREE.Group();grp.rotation.set(.38,.62,0);g.add(grp);const geo=new THREE.BoxGeometry(.6,.6,.6);
  for(const [x,y,z,gold] of [[0,.62,0],[-.6,.02,0],[.58,.06,.06,1],[-.02,-.6,.04],[.02,.02,.62],[0,0,-.58]]){const c=new THREE.Group();c.position.set(x,y,z);
   c.add(new THREE.Mesh(bary(geo.clone()),gold?glass('#F0C674','#FFE6B0',hU,false):glass('#3D7BFF','#9FE3FF',hU,false)),edgeLines(geo,gold?'#FFE2A8':'#CDEFFF',.95));grp.add(c)}
  const s=orbit(g,1.6,[1.45,0,.15],['b','g','b','g'],.5);
  return (dt,t,h)=>{grp.rotation.y+=dt*(.22+.6*h)*motion;s.rotation.y+=dt*(.5+.6*h)*motion}}];
portalObj.forEach((o,i)=>{const holder=new THREE.Object3D();holder.position.copy(o.position);holder.quaternion.copy(o.quaternion);world.add(holder);
 const g=new THREE.Group();g.position.set(0,GLY_Y,GLY_Z);holder.add(g);const hU={value:0};const up=BUILD[i](g,hU);
 const hit=new THREE.Mesh(new THREE.PlaneGeometry(WO+.6,TOP+PLAT+.8),new THREE.MeshBasicMaterial({visible:false}));hit.position.set(0,(TOP+PLAT)/2,.4);hit.userData.i=i;holder.add(hit);
 glyphs.push({g,hU,up,hit,holder})});

let dustObj=null;
// Ambient dust, gold and blue, drifting slowly upward.
{const d=[];for(let i=0;i<tier.dust;i++){const a=Math.random()*Math.PI*2,r=3+Math.sqrt(Math.random())*24;d.push({p:[Math.sin(a)*r,Math.random()*17,-Math.cos(a)*r],c:Math.random()<.3?[1.,.78,.45]:[.55,.8,1.],s:.035+Math.random()*.07})}
 dustObj=points(d,'void main(){vec3 p=position;p.y=mod(p.y+uT*(.08+.12*aSeed),17.);p.x+=sin(uT*.13+aSeed*40.)*.4;vC=aColor;vA=(.35+.65*(.5+.5*sin(uT*1.7+aSeed*70.)))*smoothstep(0.,1.5,p.y)*smoothstep(17.,14.,p.y);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=aSize*uScale/-mv.z;gl_Position=projectionMatrix*mv;}');world.add(dustObj)}

world.traverse(o=>o.layers.enable(1));
// Small, fine details (glyph parts, orbit sparks, dust) are skipped in the floor reflection: invisible there, and it halves their draw calls.
for(const g of glyphs)g.holder.traverse(o=>o.layers.disable(1));for(const o of crystal.userData.orbits)o.g.traverse(o2=>o2.layers.disable(1));for(const b of billboards)b.layers.disable(1);if(dustObj)dustObj.layers.disable(1);scene.traverse(o=>{if(o.isLight)o.layers.enable(1)});

// ================= Bloom =================
let composer=null,bloom=null;
function setupBloom(){if(!tier.bloom||!THREE.EffectComposer||!THREE.UnrealBloomPass||!THREE.RenderPass)return;try{
 const sz=renderer.getDrawingBufferSize(new THREE.Vector2()),MS=tier.aa&&renderer.capabilities.isWebGL2&&THREE.WebGLMultisampleRenderTarget;
 const rt=MS?new THREE.WebGLMultisampleRenderTarget(sz.x,sz.y):new THREE.WebGLRenderTarget(sz.x,sz.y);if(MS)rt.samples=tier.aa;rt.texture.encoding=THREE.sRGBEncoding;
 composer=new THREE.EffectComposer(renderer,rt);composer.addPass(new THREE.RenderPass(scene,camera));
 bloom=new THREE.UnrealBloomPass(new THREE.Vector2(sz.x,sz.y),.7,.5,.66);
 if(tierName!=='high'){const os=bloom.setSize.bind(bloom);bloom.setSize=(w,h)=>os(Math.max(2,w>>1),Math.max(2,h>>1))}
 composer.addPass(bloom);composer.setSize(sz.x,sz.y)}catch(e){console.warn(e);composer=null}}
setupBloom();setMirror(tier.mirror);

// ================= Camera =================
// Camera lives on a circle around the crystal: azimuth (0 = behind the crystal, PI = the entrance), radius and height,
// plus a look target. Moving between views eases these values, so every move is a gentle curve around the crystal.
const fit={r:23,h:5.6,ty:5.2,yaw:.35};
const cam={az:Math.PI,r:38,h:9,tx:0,ty:5.5,tz:0},goal={az:Math.PI,r:23,h:5.6,tx:0,ty:5.2,tz:-2};
const look={yaw:0,pitch:0,yawT:0,pitchT:0};
let mode='intro',focus=-1,hover=-1;const introStart=performance.now();
function fitCamera(){const a=innerWidth/innerHeight;camera.aspect=a;const hf=82*Math.PI/180,need=2*Math.atan(Math.tan(hf/2)/a),vmax=70*Math.PI/180,vmin=46*Math.PI/180;
 const vf=clamp(need,vmin,vmax);camera.fov=vf*180/Math.PI;camera.updateProjectionMatrix();
 fit.r=23+(need>vmax?Math.min(9,(Math.tan(need/2)/Math.tan(vmax/2)-1)*8):0);fit.yaw=a<1?.75:a<1.4?.5:.32;
 U.uScale.value=renderer.getDrawingBufferSize(_v2).y/(2*Math.tan(vf/2));if(mode!=='focus')toOverviewGoal()}
function toOverviewGoal(){goal.az=nearAz(Math.PI);goal.r=fit.r;goal.h=fit.h;goal.tx=0;goal.ty=fit.ty;goal.tz=-2.5}
function nearAz(a){while(a-cam.az>Math.PI)a-=Math.PI*2;while(a-cam.az<-Math.PI)a+=Math.PI*2;return a}
function updateCamera(dt){if(mode==='gallery'&&G){G.camera(dt);return}const sp=reduceMotion?3:1;const kA=1-Math.exp(-dt*2.1*sp),kR=1-Math.exp(-dt*(mode==='intro'?1.1:3.0)*sp),kT=1-Math.exp(-dt*2.6*sp);
 cam.az+=(goal.az-cam.az)*kA;cam.r+=(goal.r-cam.r)*kR;cam.h+=(goal.h-cam.h)*kR;cam.tx+=(goal.tx-cam.tx)*kT;cam.ty+=(goal.ty-cam.ty)*kT;cam.tz+=(goal.tz-cam.tz)*kT;
 if(!dragging&&(mode==='focus'||mode==='enter')){look.yawT*=Math.exp(-dt*1.5);look.pitchT*=Math.exp(-dt*1.5)}
 const kl=1-Math.exp(-dt*6);look.yaw+=(look.yawT-look.yaw)*kl;look.pitch+=(look.pitchT-look.pitch)*kl;
 const bob=Math.sin(time*.35)*.06*motion;
 camera.position.set(Math.sin(cam.az)*cam.r,cam.h+bob,-Math.cos(cam.az)*cam.r);camera.lookAt(cam.tx,cam.ty,cam.tz);camera.rotateY(look.yaw);camera.rotateX(look.pitch)}
function focusPortal(i){if(i<0||i>5||mode==='gallery'||mode==='enter')return;const th=ANG[i];focus=i;mode='focus';if(CATS[i].id===GALLERY_READY)loadGallery(); // prefetch code + catalog (no build) once that portal is chosen
look.yawT=look.pitchT=0;
 goal.az=nearAz(th);goal.r=8.4;goal.h=4.75;const t=onCircle(th,R-GLY_Z,GLY_Y);goal.tx=t.x;goal.ty=t.y+.05;goal.tz=t.z;
 const c=CATS[i];$('cIdx').textContent=String(i+1).padStart(2,'0')+' / 06';$('cName').textContent=c.name;$('cLine').textContent=c.line;$('card').classList.add('on');$('card').setAttribute('aria-hidden','false');
 chipEls.forEach((b,k)=>{b.classList.toggle('on',k===i);b.setAttribute('aria-pressed',k===i?'true':'false')});hint(false);
 try{history.replaceState(null,'','#'+c.id)}catch(e){}}
function toAtrium(){if(mode==='intro'||mode==='gallery'||mode==='enter')return;mode='atrium';focus=-1;look.yawT=look.pitchT=0;toOverviewGoal();$('card').classList.remove('on');$('card').setAttribute('aria-hidden','true');chipEls.forEach(b=>{b.classList.remove('on');b.setAttribute('aria-pressed','false')});
 try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}}

// ================= UI =================
const chipEls=CATS.map((c,i)=>{const b=document.createElement('button');b.className='glass';b.textContent=c.name;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>{if(mode==='intro')endIntro();focusPortal(i)});$('chips').appendChild(b);return b});
const labelEls=CATS.map((c,i)=>{const d=document.createElement('div');d.className='plabel';d.innerHTML='<i>'+String(i+1).padStart(2,'0')+'</i><b></b>';d.querySelector('b').textContent=c.short;d.title=c.name;d.addEventListener('click',()=>focusPortal(i));$('labels').appendChild(d);return d});
let toastT=0;function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2600)}
let hintOn=false;function hint(on){if(on===hintOn)return;hintOn=on;$('hint').classList.toggle('on',on)}
$('prev').addEventListener('click',()=>focusPortal((focus+5)%6));$('next').addEventListener('click',()=>focusPortal((focus+1)%6));
$('atrium').addEventListener('click',toAtrium);
$('enter').addEventListener('click',()=>enterGallery(focus));
function enterGallery(i){if(mode!=='focus'||i<0)return;
 if(CATS[i].id!==GALLERY_READY){toast('The '+CATS[i].short+' gallery opens after the first gallery is approved.');return}
 mode='enter';$('card').classList.remove('on');$('card').setAttribute('aria-hidden','true');$('chips').classList.add('away');hint(false);
 loadGallery().then(g=>g.enter(i,CATS[i])).catch(e=>{console.warn(e);mode='focus';$('chips').classList.remove('away');focusPortal(i);toast('The gallery could not load. Please try again.')})}
$('back').addEventListener('click',()=>{try{sessionStorage.setItem('usi-return','market')}catch(e){}});

// Pointer: drag to look, tap a portal to glide to it, swipe left/right between portals.
const cv=renderer.domElement,ray=new THREE.Raycaster(),ndc=new THREE.Vector2();let dragging=false,ptr=null;
function pick(x,y){ndc.set(x/innerWidth*2-1,-(y/innerHeight)*2+1);ray.setFromCamera(ndc,camera);const h=ray.intersectObjects(glyphs.map(g=>g.hit),false);return h.length?h[0].object.userData.i:-1}
cv.addEventListener('pointerdown',e=>{try{cv.setPointerCapture(e.pointerId)}catch(_){}if(mode==='enter')return;if(mode==='gallery'){G.pointer(e);return}if(ptr)return;ptr={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now()};dragging=true;if(mode==='intro')endIntro()});
cv.addEventListener('pointermove',e=>{if(mode==='gallery'){G.pointer(e);return}if(ptr&&e.pointerId===ptr.id){const dx=e.clientX-ptr.x,dy=e.clientY-ptr.y;ptr.x=e.clientX;ptr.y=e.clientY;const k=camera.fov*Math.PI/180/innerHeight;const ym=mode==='focus'?.22:fit.yaw;
  look.yawT=clamp(look.yawT+dx*k,-ym,ym);look.pitchT=clamp(look.pitchT+dy*k*.6,-.14,.16);if(Math.abs(ptr.x-ptr.sx)+Math.abs(ptr.y-ptr.sy)>8)hint(false)}
 else if(e.pointerType==='mouse'){hover=pick(e.clientX,e.clientY);cv.style.cursor=hover>=0?'pointer':'grab'}});
const endPtr=e=>{if(mode==='gallery'){G.pointer(e);return}if(!ptr||e.pointerId!==ptr.id)return;const dx=e.clientX-ptr.sx,dy=e.clientY-ptr.sy,dtm=performance.now()-ptr.t;ptr=null;dragging=false;
 if(e.type!=='pointerup')return;
 if(Math.hypot(dx,dy)<10&&dtm<450){const i=pick(e.clientX,e.clientY);if(i>=0&&i!==focus)focusPortal(i);else if(i<0&&mode==='focus'&&e.pointerType!=='mouse'){}}
 else if(mode==='focus'&&Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.6&&dtm<500){look.yawT=0;focusPortal((focus+(dx<0?1:5))%6)}};
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('pointerleave',()=>{if(!ptr)hover=-1});
addEventListener('keydown',e=>{if(mode==='intro'){endIntro();return}if(mode==='enter')return;if(mode==='gallery'){G.key(e);return}const k=e.key;
 if(k==='ArrowRight')focusPortal(focus<0?3:(focus+1)%6);else if(k==='ArrowLeft')focusPortal(focus<0?2:(focus+5)%6);
 else if(k==='Escape')toAtrium();else if(k==='Enter'&&focus>=0&&document.activeElement===cv)$('enter').click();
 else if(k>='1'&&k<='6')focusPortal(+k-1)});
function endIntro(){if(mode!=='intro')return;mode='atrium';toOverviewGoal();hint(true);setTimeout(()=>hint(false),5000)}

// Labels follow the portal crowns in the atrium view.
const _lp=new THREE.Vector3();
function updateLabels(){const show=mode==='atrium'||mode==='intro';for(let i=0;i<6;i++){const el=labelEls[i];_lp.set(0,PLAT+HS+WO/2+.95,.3).applyMatrix4(portalObj[i].matrix);_lp.project(camera);
 const vis=show&&_lp.z<1&&Math.abs(_lp.x)<1.05&&_lp.y<1.1;el.style.opacity=vis?(mode==='intro'?0:(.75+.25*H[i])):0;el.style.pointerEvents=vis?'auto':'none';
 if(vis)el.style.transform='translate('+((_lp.x*.5+.5)*innerWidth).toFixed(1)+'px,'+((-_lp.y*.5+.5)*innerHeight).toFixed(1)+'px) translate(-50%,-100%)'}}

// ================= Gallery loader (Phase 2): nothing is fetched or built until it is needed =================
let G=null,gLoad=null;
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=res;s.onerror=()=>rej(new Error('load '+src));document.head.appendChild(s)})}
function loadGallery(){if(!gLoad){gLoad=loadScript('./marketplace/gallery.js?v=2').then(()=>{G=window.__mkGallery(MK);return G});gLoad.catch(()=>{gLoad=null})}return gLoad}
const MK={THREE,$,scene,world,camera,renderer,U,floorU,atriumOnly,tier:()=>tier,motion,reduceMotion,coarse,points,toast,hint,clamp,HASH,
 cam,goal,look,ANG,R,PLAT,HS,onCircle,cats:CATS,
 setMode:m=>{mode=m},mode:()=>mode,fit:()=>fitCamera(),
 toPortal:i=>{mode='focus';$('chips').classList.remove('away');focusPortal(i)}}; // back in the atrium, beside the portal we left through

// ================= Adaptive quality and FPS meter =================
let qT=-2,qF=0,autoSteps=0;
const ladder=[()=>tier.mirror>.34&&(setMirror(.33),1),()=>tier.mirror>0&&(setMirror(0),1),()=>composer&&(composer=null,1),()=>dpr>1.25&&(setDpr(1.25),1),()=>dpr>1&&(setDpr(1),1)];
function setDpr(v){dpr=v;renderer.setPixelRatio(v);resize()}
function quality(dt){if(forced||window.__bench)return; // the benchmark measures each scene at a fixed quality
qT+=dt;if(qT<0)return;qF++;if(qT>=2.5){const fps=qF/qT;qT=0;qF=0;if(fps<45){for(const f of ladder)if(f()){autoSteps++;break}}}}
const fpsEl=$('fps'),showFps=/[?&]fps=1/.test(qs);fpsEl.hidden=!showFps;let fT=0,fN=0;const stats={fps:0,calls:0,tris:0};
function meter(dt){fT+=dt;fN++;if(fT>=.5){stats.fps=fN/fT;fT=0;fN=0;if(showFps)fpsEl.textContent=stats.fps.toFixed(0)+' fps  '+tierName+(autoSteps?' -'+autoSteps:'')+'\n'+renderer.domElement.width+'×'+renderer.domElement.height+' @'+dpr+'\n'+stats.calls+' draws  '+(stats.tris/1000).toFixed(0)+'k tris\nmirror '+(tier.mirror?tier.mirror:'off')+'  glow '+(composer?'on':'off')+(G&&G.built()?'\ngallery '+(mode==='gallery'?'in':'built')+(capped?'  idle 30':''):'')}}

// ================= Resize, visibility, loop =================
function resize(){renderer.setSize(innerWidth,innerHeight);if(G)G.resize();if(composer)composer.setSize(...renderer.getDrawingBufferSize(_v2).toArray());if(tier.mirror)setMirror(tier.mirror);fitCamera()}
addEventListener('resize',resize);fitCamera();
const clock=new THREE.Clock();let time=0,raf=0,paused=false;
document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;cancelAnimationFrame(raf)}else if(paused){paused=false;clock.getDelta();qT=-1.5;qF=0;raf=requestAnimationFrame(frame)}});
function updateMirror(){camera.updateMatrixWorld();mirCam.position.set(camera.position.x,-camera.position.y,camera.position.z);camera.getWorldDirection(_v);_w.copy(camera.position).add(_v);_w.y=-_w.y;mirCam.up.set(0,1,0);mirCam.lookAt(_w);
 mirCam.projectionMatrix.copy(camera.projectionMatrix);mirCam.updateMatrixWorld();mirCam.matrixWorldInverse.copy(mirCam.matrixWorld).invert();texM.copy(BIAS).multiply(mirCam.projectionMatrix).multiply(mirCam.matrixWorldInverse)}
function update(dt){
 if(mode==='intro'&&performance.now()-introStart>2800)endIntro() // wall clock, so slow devices don't get a longer intro
 if(world.visible){ // the atrium's animation is skipped entirely while a gallery is showing
 for(let i=0;i<6;i++){const tgt=i===focus?1:i===hover?.6:mode==='intro'?0:.12;H[i]+=(tgt-H[i])*Math.min(1,dt*3);glyphs[i].hU.value=H[i];glyphs[i].up(dt,time,H[i]);glyphs[i].g.position.y=GLY_Y+Math.sin(time*.9+i)*.09*motion}
 H[6]+=((focus<0?.45:.25)-H[6])*Math.min(1,dt*2);crystalU.uH.value=H[6];
 crystal.rotation.y+=dt*.12*motion;crystal.position.y=5.25+Math.sin(time*.6)*.1*motion;crystal.userData.core.rotation.y-=dt*.3*motion;
 for(const o of crystal.userData.orbits)o.g.rotation.z+=dt*o.sp*motion}
 if(G)G.update(dt);
 updateCamera(dt);if(world.visible){for(const b of billboards)b.quaternion.copy(camera.quaternion);goldGlow()}updateLabels()}
// Up close, the portal gold eases down by GOLD_NEAR: every channel scaled equally, so the same gold hue with less light. Full strength in the atrium overview.
const GOLD_NEAR=.34,_pc=new THREE.Vector3();let goldNow=1;
function goldGlow(){let d=1e9;for(const o of portalObj){_pc.set(0,PLAT+HS*.6,0).applyMatrix4(o.matrix);d=Math.min(d,_pc.distanceTo(camera.position))}
 const t=clamp((16-d)/6.5,0,1),g=1-GOLD_NEAR*t*t*(3-2*t);if(Math.abs(g-goldNow)<.002)return;goldNow=g;U.uGold.value=g;
 noseMat.color.copy(noseBase).multiplyScalar(g);lampMat.color.copy(lampBase).multiplyScalar(g);portalGold.envMapIntensity=1.4*g;portalGold.emissiveIntensity=.6*g;portalGold.color.copy(goldBase).multiplyScalar(g)}
function render(){renderer.info.reset();if(mirRT){updateMirror();renderer.setRenderTarget(mirRT);renderer.render(scene,mirCam);renderer.setRenderTarget(null)}
 if(composer)composer.render();else renderer.render(scene,camera);stats.calls=renderer.info.render.calls;stats.tris=renderer.info.render.triangles}
let capped=false,capAcc=0;
function frame(){if(paused)return;raf=requestAnimationFrame(frame);const raw=clock.getDelta();
 capped=!!(G&&G.idle());if(capped){capAcc+=raw;if(capAcc<1/31)return}const step=capped?capAcc:raw;capAcc=0; // product panel open and still: ~30 fps to save battery
 const dt=Math.min(step,.05);time+=dt;U.uT.value=time*motion;update(dt);render();if(!capped)quality(step);meter(step);if(window.__bench)window.__bench.frame(step,capped)} // animation uses capped dt; FPS meter and quality ladder use real elapsed time
// Shader warm-up before the first frame, then fade in.
try{renderer.compile(scene,camera)}catch(e){}
const start=(location.hash||'').slice(1),si=CATS.findIndex(c=>c.id===start),deep=/^(agents\/gallery|p=)/.test(start);
raf=requestAnimationFrame(frame);requestAnimationFrame(()=>{$('veil').style.opacity=0;window.__mkReady=performance.now();
 if(deep){endIntro();focusPortal(0);loadGallery().then(g=>{enterGallery(0);const pm=start.match(/^p=([\w-]+)/);if(pm)g.openWhenReady(pm[1])}).catch(()=>{})}
 else if(si>=0){endIntro();focusPortal(si)}});
// GPU memory estimate (WebGL can't report real usage): canvas + render targets + textures + geometry buffers.
function gpuMB(){const sz=renderer.getDrawingBufferSize(new THREE.Vector2()),px=sz.x*sz.y;let b=px*8; // colour + depth
 if(composer)b+=px*4*(tier.aa?2:1)+px*8+px*4*(tierName==='high'?1:.25)*1.33*2; // composer targets, bloom mip chain
 if(mirRT)b+=mirRT.width*mirRT.height*8;b+=tier.sky*tier.sky*24*1.33+256*256*24*1.6; // sky cube + environment map
 const seen=new Set();scene.traverse(o=>{const g=o.geometry;if(!g||seen.has(g))return;seen.add(g);for(const k in g.attributes){const a=g.attributes[k];b+=a.array?a.array.byteLength:0}if(g.index)b+=g.index.array.byteLength;if(o.isInstancedMesh)b+=o.instanceMatrix.array.byteLength});
 if(G)b+=G.textureBytes();return +(b/1048576).toFixed(1)}
window.__market={cam:()=>({cam,goal,look,mode,focus}),stats:()=>Object.assign({tier:tierName,forced:!!forced,dpr,mirror:tier.mirror,bloom:!!composer,autoSteps,canvas:[cv.width,cv.height],mode,capped,gallery:!!(G&&G.built()),textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries},stats),
 focus:focusPortal,atrium:toAtrium,skipIntro:endIntro,gpuMB,enterGallery:i=>{i=i||0;if(mode!=='focus')focusPortal(i);enterGallery(i)},gallery:()=>G,loadGallery};
if(/[?&]bench=1/.test(qs))loadScript('./marketplace/bench.js?v=2').catch(e=>console.warn(e));
})();
