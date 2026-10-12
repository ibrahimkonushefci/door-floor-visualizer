import type { Id } from '../data/types';
export const favoritesKey=(brandId:Id)=>`pd:${brandId}:favorites:v1`;
export function readFavorites(storage:Pick<Storage,'getItem'>|null,key:string,validIds:ReadonlySet<Id>):ReadonlySet<Id> {
  try{
    const raw=storage?.getItem(key);if(!raw||raw.length>20000)return new Set();
    const parsed:unknown=JSON.parse(raw);if(!Array.isArray(parsed))return new Set();
    return new Set([...new Set(parsed.filter((id):id is Id=>typeof id==='string'&&validIds.has(id)))].sort().slice(0,200));
  }catch{return new Set();}
}
export function toggleFavorite(ids:ReadonlySet<Id>,id:Id):ReadonlySet<Id> {
  const next=new Set(ids);if(next.has(id))next.delete(id);else if(next.size<200)next.add(id);return new Set([...next].sort());
}
export interface FavoritesSnapshot {ids:ReadonlySet<Id>;ready:boolean}
export function createFavoritesStore(key:string,validIds:ReadonlySet<Id>) {
  const initial:FavoritesSnapshot={ids:new Set(),ready:false};let snapshot=initial;let storage:Pick<Storage,'getItem'|'setItem'>|null=null;
  const listeners=new Set<()=>void>();
  const publish=(ids:ReadonlySet<Id>)=>{snapshot={ids,ready:true};for(const listener of listeners)listener();};
  const persist=()=>{try{storage?.setItem(key,JSON.stringify([...snapshot.ids].sort()));}catch{/* Keep this tab's in-memory snapshot. */}};
  return {
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    getSnapshot:()=>snapshot,getServerSnapshot:()=>initial,
    hydrate(nextStorage:typeof storage){storage=nextStorage;publish(readFavorites(storage,key,validIds));persist();},
    refresh(){if(storage)publish(readFavorites(storage,key,validIds));},
    toggle(id:Id){if(!validIds.has(id))return;publish(toggleFavorite(snapshot.ids,id));persist();},
  };
}
