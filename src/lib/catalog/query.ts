import type { CategoryId,DoorProduct,Id } from '../data/types';
export const categoryIds=['all','interior-doors','hidden-doors','laminate','parquet','trim'] as const;
export interface CatalogQuery {category:CategoryId;savedOnly:boolean}
export const QUERY_CHANGE_EVENT='pd:querychange';
export function parseCatalogQuery(params:URLSearchParams):CatalogQuery {
  if(params.toString().length>2048)return {category:'all',savedOnly:false};
  const category=params.get('category');
  return {category:categoryIds.find(id=>id===category)||'all',savedOnly:params.get('saved')==='1'};
}
export function serializeCatalogQuery(query:CatalogQuery):URLSearchParams {
  const params=new URLSearchParams();
  if(query.category!=='all')params.set('category',query.category);
  if(query.savedOnly)params.set('saved','1');
  return params;
}
export function mergeCatalogQuery(params:URLSearchParams,query:CatalogQuery):URLSearchParams {
  const output=new URLSearchParams(params);
  output.delete('category');output.delete('saved');
  for(const [key,value] of serializeCatalogQuery(query))output.set(key,value);
  return output;
}
export function updateCatalogQuery(query:CatalogQuery,mode:'push'|'replace'='push'):void {
  const url=new URL(window.location.href);
  url.search=mergeCatalogQuery(url.searchParams,query).toString();
  if(url.href!==window.location.href){window.history[mode==='push'?'pushState':'replaceState'](null,'',url);window.dispatchEvent(new Event(QUERY_CHANGE_EVENT));}
}
export function subscribeCatalogQuery(callback:()=>void){window.addEventListener('popstate',callback);window.addEventListener(QUERY_CHANGE_EVENT,callback);return()=>{window.removeEventListener('popstate',callback);window.removeEventListener(QUERY_CHANGE_EVENT,callback);};}
export function parseProductQuery(params:URLSearchParams,product:DoorProduct):{sizeId:Id;finishId:Id} {
 const safe=params.toString().length<=2048;const size=safe?params.get('size'):null;const finish=safe?params.get('finish'):null;
 return {sizeId:product.sizes.some(s=>s.id===size)?size!:product.defaultSizeId,finishId:product.finishIds.includes(finish||'')?finish!:product.defaultFinishId};
}
export function mergeProductQuery(params:URLSearchParams,product:DoorProduct,value:{sizeId:Id;finishId:Id}):URLSearchParams {
 const normalized=parseProductQuery(new URLSearchParams({size:value.sizeId,finish:value.finishId}),product);const output=new URLSearchParams(params);output.delete('size');output.delete('finish');
 if(normalized.sizeId!==product.defaultSizeId)output.set('size',normalized.sizeId);if(normalized.finishId!==product.defaultFinishId)output.set('finish',normalized.finishId);return output;
}
export function updateProductQuery(product:DoorProduct,value:{sizeId:Id;finishId:Id},mode:'push'|'replace'='push'){
 const url=new URL(window.location.href);url.search=mergeProductQuery(url.searchParams,product,value).toString();if(url.href!==window.location.href){window.history[mode==='push'?'pushState':'replaceState'](null,'',url);window.dispatchEvent(new Event(QUERY_CHANGE_EVENT));}
}
export function catalogReturnQuery(params:URLSearchParams):string {const value=serializeCatalogQuery(parseCatalogQuery(params)).toString();return value?'?'+value:'';}
