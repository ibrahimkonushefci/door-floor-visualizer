import { solveHomography,projectPoint } from '../studio/render/homography';
import { compatibleDoor } from '../studio/compatibility';
import { normalizeSelection } from '../studio/state';
import { z } from 'zod';
import { brandSchema, productsSchema, materialsSchema } from './schemas';
import { validateMessages } from '../i18n/messages';
import { buildThemeVars } from '../brand/theme';
import type { SiteData } from './types';
const siteSchema=z.strictObject({brand:brandSchema,products:productsSchema,materials:materialsSchema});
function unique(values: readonly string[], path:string){if(new Set(values).size!==values.length)throw new Error(`${path}: duplicate IDs`);}
export function validateSiteData(input:unknown,phase:1|2|3|4|5):SiteData {
 const data=siteSchema.parse(input); const {brand,products,materials}=data;
 validateMessages(); buildThemeVars(brand);
 if(!brand.demoMode&&(brand.siteUrl===null||Object.values(brand.contact).some(v=>!v||v==='+38344000000')))throw new Error('brand: live mode requires verified contacts and public siteUrl');
 unique(products.products.map(p=>p.id),'products');unique(products.products.map(p=>p.slug),'slugs');unique(products.images.map(p=>p.id),'images');
 for(const [key,values] of Object.entries(materials))if(Array.isArray(values))unique(values.map(v=>v.id),key);
 const ids=new Set(products.products.map(p=>p.id));const images=new Set(products.images.map(p=>p.id));
 for(const p of products.products){unique(p.imageIds,`${p.id}.imageIds`);for(const id of p.imageIds)if(!images.has(id))throw new Error(`${p.id}: missing image ${id}`);for(const id of p.relatedProductIds)if(!ids.has(id)||id===p.id)throw new Error(`${p.id}: invalid related product ${id}`);if(p.kind==='door')unique(p.sizes.map(s=>s.id),`${p.id}.sizes`);if(p.kind==='floor'&&!materials.floorCollections.some(c=>c.id===p.collectionId))throw new Error(`${p.id}: missing collection`);}
 if(phase===1&&(products.products.length||products.images.length||materials.doorFinishes.length||materials.floorCollections.length||materials.scenes.length))throw new Error('Phase 1 requires empty catalog/material data');
 if(phase>=2&&products.products.filter(p=>p.published).length<(phase===5?12:phase===4?10:6))throw new Error(`Phase ${phase}: catalog incomplete`);
 if(phase===5){
  if(products.products.length!==12||products.products.filter(p=>p.published).length!==12||products.images.length!==24||products.products.some(p=>p.imageIds.length!==2))throw new Error('Phase 5: expected exactly 12 products and 24 images');
  const expected=['dera-bardhe','lis-natyral-10','dera-lis','dushk-fshatar-8','dera-kashmir','peshk-natyral-12','dera-antracit','arre-klasike-12','dera-xham','hirte-skandinave-8','pervaze-mdf','lajsne-mdf'];
  if(expected.some(id=>!ids.has(id)))throw new Error('Phase 5: fixed catalog inventory mismatch');
  const translations=(value:unknown,path:string)=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach((v,i)=>translations(v,`${path}[${i}]`));return;}const obj=value as Record<string,unknown>;if('sq' in obj)for(const locale of ['sq','en','de'])if(typeof obj[locale]!=='string'||!(obj[locale] as string).trim())throw new Error(`${path}.${locale}: missing final translation`);for(const [k,v] of Object.entries(obj))translations(v,`${path}.${k}`);};
  translations(data,'data');validateMessages(true);
 }
 const plannedFinishes=new Set(['bardhe-mat','kashmir','lis-natyral','arre-erret','dushk-hirte','antracit','xham-erret']);
 const scenes=new Set(materials.scenes.map(s=>s.id));const finishes=new Set(materials.doorFinishes.map(f=>f.id));
 for(const p of products.products){
  if(p.kind==='door'){
   unique(p.finishIds,`${p.id}.finishIds`);
   if(!p.sizes.some(s=>s.id===p.defaultSizeId)||!p.finishIds.includes(p.defaultFinishId))throw new Error(`${p.id}: invalid default size/finish`);
   for(const id of p.finishIds)if(!finishes.has(id)&&!(phase<4&&plannedFinishes.has(id)))throw new Error(`${p.id}: unknown finish ${id}`);
  }
  if(p.kind!=='trim')for(const id of p.compatibleSceneIds)if(!scenes.has(id)&&!(phase<4&&['living-standard','corridor-standard','corridor-hidden'].includes(id)))throw new Error(`${p.id}: unknown scene ${id}`);
  for(const id of p.imageIds){const image=products.images.find(i=>i.id===id)!;if(!image.source.startsWith(`brand/assets/products/${p.id}/`))throw new Error(`${p.id}: mismatched image source`);}
  if(phase>=3&&p.published&&p.imageIds.length<2)throw new Error(`Phase ${phase}: ${p.id} gallery incomplete`);
 }
 if(phase===2||phase===3){
  const seed=['dera-bardhe','lis-natyral-10','dera-lis','dushk-fshatar-8','dera-kashmir','peshk-natyral-12'];
  if(products.products.length!==6||seed.some(id=>!ids.has(id))||products.images.length!==(phase===2?6:12)||products.products.some(p=>p.imageIds.length!==(phase===2?1:2))||materials.scenes.length)throw new Error(`Phase ${phase}: unexpected seed inventory`);
 }
 if(phase===2||phase===3){
  const pendingPaths=new Set(['/media/textures/doors/lis-natyral.png','/media/textures/doors/arre-erret.png','/media/textures/doors/dushk-hirte.png',...['lis-natyral-10','dushk-fshatar-8','peshk-natyral-12'].flatMap(id=>[`/media/textures/floors/${id}/atlas.png`,`/media/textures/floors/${id}/trim.png`])]);
  for(const f of materials.doorFinishes)for(const a of [f.kind==='opaque'?f.appearance:null,f.trim.appearance])if(a?.kind==='texture'&&!pendingPaths.has(a.texture))throw new Error('Unknown pending door texture');
  for(const c of materials.floorCollections)if(!pendingPaths.has(c.atlas.image)||(c.trim.appearance.kind==='texture'&&!pendingPaths.has(c.trim.appearance.texture)))throw new Error('Unknown pending floor texture');
 }
 if(phase>=4&&(materials.scenes.length!==2||materials.doorFinishes.length!==7||materials.floorCollections.length!==5))throw new Error(`Phase ${phase}: Studio data incomplete`);
 if(phase>=4){
  const catalog={products:products.products,materials};
  for(const scene of materials.scenes){
   unique(scene.surfaces.map(s=>s.id),`${scene.id}.surfaces`);
   if(scene.width!==1600||scene.height!==1200)throw new Error('Wrong canonical scene dimensions');
   for(const id of scene.allowedDoorProductIds){const p=products.products.find(p=>p.id===id);if(p?.kind!=='door'||!compatibleDoor(p,scene,catalog))throw new Error('Incompatible allowed door');}
   for(const id of scene.allowedFloorProductIds){const p=products.products.find(p=>p.id===id);if(p?.kind!=='floor'||!p.compatibleSceneIds.includes(scene.id))throw new Error('Incompatible allowed floor');}
   if(scene.frameType==='concealed-aluminium'&&(scene.surfaces.some(s=>s.role==='frame')||scene.allowedFrameModes.join()!=='door'))throw new Error('Hidden frame must remain inert');
   const normal=normalizeSelection(scene.defaultSelection,catalog);if(normal.warnings.length||normal.selection.sceneId!==scene.id)throw new Error('Incompatible default selection');
   for(const surface of scene.surfaces){const m=surface.mapping,h=solveHomography(m.worldQuadMm,m.imageQuad01);for(let i=0;i<2;i++){const p=projectPoint(h,m.calibration.referenceWorldSegmentMm[i]),q=m.calibration.referenceImageSegment01[i];if(Math.hypot((p[0]-q[0])*scene.width,(p[1]-q[1])*scene.height)>1)throw new Error('Calibration reference mismatch');}}
  }
  for(const p of products.products)if(p.kind==='door')for(const id of p.finishIds){const f=materials.doorFinishes.find(f=>f.id===id)!;if((p.doorType==='glass')!==(f.kind==='glass'))throw new Error('Glass/opaque finish mismatch');}
 }
 return data;
}
export function parsePhase(args:readonly string[],fallback:1|2|3|4|5):1|2|3|4|5 {const flags=args.filter(v=>v.startsWith('--phase'));if(flags.length===0)return fallback;if(flags.length!==1||!/^--phase=[1-5]$/.test(flags[0]))throw new Error('Expected --phase=1..5');return Number(flags[0].slice(-1)) as 1|2|3|4|5;}
