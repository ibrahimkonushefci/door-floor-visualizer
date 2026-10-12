// Reproducible mask/light/calibration derivation for the approved generated plates.
// base.png and glass-source.png are frozen raster inputs; no AI calls at build time.
import sharp from 'sharp';
import {solveHomography,projectPoint} from '../src/lib/studio/render/homography.ts';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const rect=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d]],quad=(w,h)=>rect(0,0,w,h);
const normalized=p=>p.map(([x,y])=>[x/1600,y/1200]);
const loc=(sq,en,de)=>({sq,en,de});
const configs=[{
 id:'living-standard',source:'exec-16a02ac4-660a-41a9-beab-d80c0561dea9.png',crop:[151,35,1196,897],
 leaf:rect(818,53,1107,671),left:rect(784,52,812,674),right:rect(1116,52,1142,674),top:rect(784,19,1142,46),outer:rect(783,18,1143,674),
 floor:[[251,676],[784,674],[1143,674],[1451,675],[1600,743],[1600,1200],[0,1200],[0,803],[17,803],[17,732],[190,699],[214,700],[228,697],[251,696]],
 floorQuad:[[251,676],[1451,675],[1600,1200],[0,1200]],hardware:[[1038,382,1101,407],[193,696,216,749],[12,728,25,765]],
 skirts:[['back-left',rect(253,642,783,674),2000],['back-right',rect(1144,642,1450,674),1300],['right',[[1452,642],[1600,704],[1600,741],[1452,674]],1800]],
}, {
 id:'corridor-standard',source:'exec-783089a9-9d3d-43de-8df5-6bb635982e94.png',crop:[0,0,1448,1086],
 leaf:rect(658,63,937,681),left:rect(626,59,651,683),right:rect(944,59,971,683),top:rect(626,30,971,55),outer:rect(625,29,972,684),
 floor:[[384,684],[1204,684],[1306,760],[1394,760],[1453,860],[1600,958],[1600,1200],[0,1200],[0,1017],[44,978],[44,972],[245,802],[257,792],[257,736],[284,717],[341,717]],
 floorQuad:[[384,684],[1204,684],[1600,1200],[0,1200]],hardware:[[667,374,724,396],[934,121,945,162],[934,366,945,407],[934,584,945,624]],
 skirts:[['back-left',rect(384,653,625,682),1100],['back-right',rect(973,653,1203,682),1100],['left',[[342,676],[383,653],[383,683],[342,715]],500],['right',[[1205,653],[1305,718],[1305,758],[1205,683]],1100],['left-near',[[0,977],[243,760],[243,798],[0,1015]],2000],['right-near',[[1454,820],[1600,909],[1600,956],[1454,858]],1600]],
}];
// Living remediation uses a tighter shared source crop. Transform every traced
// layer from the original inspection coordinates with the exact same affine map.
const living=configs[0],transform=poly=>poly.map(([x,y])=>[(40+x*1368/1600-151)*1600/1196,y*1026/897]);
for(const key of ['leaf','left','right','top','outer','floor','floorQuad'])living[key]=transform(living[key]);
living.skirts=living.skirts.map(([id,poly,length])=>[id,transform(poly),length]);
living.hardware=living.hardware.map(([x0,y0,x1,y1])=>{const p=transform([[x0,y0],[x1,y1]]);return [Math.max(0,Math.floor(p[0][0])),Math.max(0,Math.floor(p[0][1])),Math.min(1600,Math.ceil(p[1][0])),Math.min(1200,Math.ceil(p[1][1]))];});
const ledger=JSON.parse(await readFile('brand/asset-sources.json','utf8'));
async function provenance(path,note){ledger.assets=ledger.assets.filter(a=>a.localPath!==path);ledger.assets.push({id:path.replaceAll('/','-').replace('.png',''),localPath:path,sourceUrl:null,author:'OpenAI ImageGen / Porta & Dysheme authored derivatives',usageBasis:'generated',licenseNote:note,depictsProductId:null,isIllustrative:true,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});}
async function mask(dir,name,polygons){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="black"/>${polygons.map(p=>`<polygon points="${p.map(v=>v.join(',')).join(' ')}" fill="white"/>`).join('')}</svg>`;const data=await sharp(Buffer.from(svg)).removeAlpha().ensureAlpha().raw().toBuffer();return saveMask(dir,name,data);}
async function saveMask(dir,name,data){await sharp(data,{raw:{width:1600,height:1200,channels:4}}).png().toFile(`${dir}/${name}.png`);let x0=1600,y0=1200,x1=-1,y1=-1;for(let i=0;i<1600*1200;i++)if(data[i*4]){const x=i%1600,y=Math.floor(i/1600);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return {alpha:`/media/scenes/${dir.split('/').at(-1)}/${name}.png`,boundsPx:x1<0?[0,0,1600,1200]:[x0,y0,x1-x0+1,y1-y0+1]};}
for(const cfg of configs){const dir=`brand/assets/scenes/${cfg.id}`;await mkdir(dir,{recursive:true});const base=await sharp(dir+'/base.png').ensureAlpha().raw().toBuffer();await sharp(dir+'/base.png').resize(320,240).png().toFile(dir+'/thumbnail.png');
 const protect=Buffer.alloc(1600*1200*4);for(let i=0;i<1600*1200;i++)protect[i*4+3]=255;
 for(const [x0,y0,x1,y1] of cfg.hardware)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*1600+x)*4,v=Math.max(base[i],base[i+1],base[i+2]),coverage=Math.round(Math.max(0,Math.min(1,(115-v)/30))*255);protect[i]=protect[i+1]=protect[i+2]=coverage;}
 const protectedMask=await saveMask(dir,'protected-mask',protect),surfaces=[],neutralPatches=[],references=[];
 const defs=[['floor','floor',cfg.floor,quad(4500,5000),cfg.floorQuad],['leaf','door-leaf',cfg.leaf,quad(900,2000),cfg.leaf],['frame-left','frame',cfg.left,quad(70,2000),cfg.left],['frame-right','frame',cfg.right,quad(70,2000),cfg.right],['frame-top','frame',cfg.top,quad(1040,70),cfg.top],...cfg.skirts.map(([name,poly,length])=>['skirting-'+name,'skirting',poly,quad(length,80),poly])];
 const diffuse=Buffer.alloc(base.length);for(let i=0;i<1600*1200;i++){const j=i*4,v=Math.round(.2126*base[j]+.7152*base[j+1]+.0722*base[j+2]);diffuse[j]=diffuse[j+1]=diffuse[j+2]=v;diffuse[j+3]=255;}
 // Source pass is neutral and seamless. Preserve lighting edges without a broad blur.
 for(const [id,role,poly,world,image] of defs){const m=await mask(dir,id+'-mask',[poly]);const planeLight=Buffer.alloc(diffuse.length);for(let i=0;i<1600*1200;i++)planeLight[i*4+3]=255;const [bx,by,bw,bh]=m.boundsPx;for(let y=by;y<by+bh;y++)planeLight.set(diffuse.subarray((y*1600+bx)*4,(y*1600+bx+bw)*4),(y*1600+bx)*4);await sharp(planeLight,{raw:{width:1600,height:1200,channels:4}}).png().toFile(`${dir}/${id}-diffuse.png`);
  const cx=Math.floor(image.reduce((n,p)=>n+p[0],0)/4),cy=Math.floor(image.reduce((n,p)=>n+p[1],0)/4),patch=rect(cx-1,cy-1,cx+2,cy+2),values=[];
  for(let y=cy-1;y<cy+2;y++)for(let x=cx-1;x<cx+2;x++){const c=diffuse[(y*1600+x)*4]/255;values.push(c<=.04045?c/12.92:((c+.055)/1.055)**2.4);}values.sort((a,b)=>a-b);const baseline=values[4];
  const calibration={method:'authored-reference',note:'Artist-fitted illustrative virtual plane; not independently measured physical scale. See AUTHORING.md.',referenceLengthMm:world[1][0],referenceImageSegment01:normalized([image[0],image[1]]),referenceWorldSegmentMm:[world[0],world[1]]};
  if(calibration.referenceImageSegment01.some(p=>p.some(v=>v<0||v>1))){
   const end=[world[1][0]*.4,0],matrix=solveHomography(world,normalized(image));calibration.referenceLengthMm=end[0];calibration.referenceWorldSegmentMm=[world[0],end];calibration.referenceImageSegment01=[projectPoint(matrix,world[0]),projectPoint(matrix,end)];
  }
  surfaces.push({id,role,mask:m,lighting:{diffuse:`/media/scenes/${cfg.id}/${id}-diffuse.png`,baselineLinear:baseline,shadeMin:.18,shadeMax:1.65,specular:null,specularIncludedInDiffuse:false},mapping:{worldQuadMm:world,imageQuad01:normalized(image),calibration},uvRotationDeg:role==='door-leaf'||role==='frame'&&id!=='frame-top'?90:0});
  neutralPatches.push({surfaceId:id,polygon01:normalized(patch),medianLinear:baseline,measurementNote:'Median linear grayscale luminance at the nine pixel centers in the recorded neutral patch.'});references.push({label:id+' virtual edge',planeSurfaceId:id,lengthMm:calibration.referenceLengthMm,imageSegment01:calibration.referenceImageSegment01,provenance:'Authored illustrative dimensions, no independent measured same-plane reference.'});
 }
 // Partition antialiased shared edges, prioritizing trim over floor. No pixel
 // receives more than one total coverage, including source raster rounding.
 const owned=new Uint16Array(1600*1200);
 for(const surface of [...surfaces].reverse()){
  const name=surface.id+'-mask',pixels=await sharp(`${dir}/${name}.png`).ensureAlpha().raw().toBuffer();
  for(let i=0;i<owned.length;i++){const c=Math.min(pixels[i*4],255-owned[i]);pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=c;owned[i]+=c;}
  surface.mask=await saveMask(dir,name,pixels);
 }
 const doorInserts=[];
 if(cfg.id==='living-standard'){const replacementMask=await mask(dir,'smoke-glass-black-mask',[cfg.outer]),glass=await sharp(dir+'/glass-source.png').ensureAlpha().raw().toBuffer(),coverage=await sharp(dir+'/smoke-glass-black-mask.png').ensureAlpha().raw().toBuffer();for(let i=0;i<1600*1200;i++)glass[i*4+3]=coverage[i*4]?255:0;await sharp(glass,{raw:{width:1600,height:1200,channels:4}}).png().toFile(dir+'/smoke-glass-black.png');const glassProtection=await mask(dir,'smoke-glass-black-protected-mask',[]);doorInserts.push({variantKey:'smoke-glass-black',rgba:`/media/scenes/${cfg.id}/smoke-glass-black.png`,replacementMask,protectedMask:glassProtection,allowedFrameModes:['black'],sourceNote:'ImageGen edit of exact new living plate. Complete old leaf/casing/hardware replaced; immutable base supplies all pixels outside opening.'});}
 const defaultSelection={version:1,sceneId:cfg.id,doorProductId:'dera-bardhe',doorFinishId:cfg.id==='living-standard'?'bardhe-mat':'kashmir',floorProductId:cfg.id==='living-standard'?'lis-natyral-10':'peshk-natyral-12',frameMode:'door',skirtingMode:'floor',floorRotationDeg:0};
 const scene={id:cfg.id,name:cfg.id==='living-standard'?loc('Dhoma e ditës','Living room','Wohnraum'):loc('Korridori','Hallway','Flur'),description:loc('Skenë demonstrimi e gjeneruar','Generated demo scene','Generierte Demoszene'),width:1600,height:1200,base:`/media/scenes/${cfg.id}/base.webp`,thumbnail:`/media/scenes/${cfg.id}/thumbnail.webp`,fallback:`/media/scenes/${cfg.id}/fallback.webp`,frameType:'standard-casing',depictedDoorSizeMm:{width:900,height:2000},surfaces,protectedMask,foreground:null,doorInserts,allowedDoorProductIds:cfg.id==='living-standard'?['dera-bardhe','dera-lis','dera-xham']:['dera-bardhe','dera-lis'],allowedFloorProductIds:['lis-natyral-10','dushk-fshatar-8','peshk-natyral-12','arre-klasike-12','hirte-skandinave-8'],allowedFrameModes:['door','floor','black'],allowedSkirtingModes:['door','floor','black'],defaultSelection,assetRevision:'pending'};
 await writeFile(dir+'/calibration.json',JSON.stringify({schemaVersion:1,scene,sourceCrop:{originalWidth:1448,originalHeight:1086,cropPx:cfg.crop,outputWidth:1600,outputHeight:1200},neutralPatches,references},null,2)+'\n');
 await writeFile(dir+'/AUTHORING.md',`# ${cfg.id} — Phase 4 remediation\n\nGenerated photographic neutral-material demo with the built-in ImageGen tool, 11 October 2026. Source ${cfg.source}, 1448×1086. Uniform shared crop ${cfg.crop.join(', ')} →1600×1200. Living glass uses the identical transform. Full prompt set: verification/render-fixtures/p4-remediation-prompts.json. Frozen raster input and reproducible masks/patch medians: scripts/author-remediation-scenes.mjs.\n\nHand-traced antialiased surface polygons are based on final pixels. Neutral seamless resin/door pass has no baked planks, wood knots or grain. Diffuse is grayscale of this neutral pass, preserving light/contact boundaries. Specular is null; broad neutral sheen remains an approximation, not material-dependent physical reflection. Hardware protection extracts dark handle/hinge pixels in bounded authored regions. Casing and every skirting plane have separate mappings.\n\n**Physical calibration unresolved:** declared floor/door/trim millimeters are artist-fitted illustrative virtual geometry. Reference edges check self-consistency, not independently measured scale. No measured-camera or independent floor-plane threshold reference exists. Generated scenes remain illustrative and cannot certify real plank size or supplier color. This gap is explicitly retained by the approved remediation plan.\n`);
 const {readdir}=await import('node:fs/promises');for(const name of (await readdir(dir)).filter(n=>n.endsWith('.png')))await provenance(dir+'/'+name,'Phase 4 remediation generated illustrative neutral plate or authored derivative. Prompt set and physical-scale limitations recorded in AUTHORING.md.');
}
await writeFile('brand/asset-sources.json',JSON.stringify(ledger,null,2)+'\n');
