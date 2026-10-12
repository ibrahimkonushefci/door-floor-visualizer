import type { DoorProduct,RoomScene,StudioSelection } from '../data/types';
import type { StudioCatalog } from './types';
export function compatibleDoor(p:DoorProduct,scene:RoomScene,c:StudioCatalog){return p.published&&p.compatibleSceneIds.includes(scene.id)&&scene.allowedDoorProductIds.includes(p.id)&&(p.frameType===scene.frameType||(p.doorType==='glass'&&scene.doorInserts.some(i=>c.materials.doorFinishes.some(f=>f.kind==='glass'&&p.finishIds.includes(f.id)&&f.variantKey===i.variantKey))));}
export function selectionEqual(a:StudioSelection|null,b:StudioSelection|null){return !!a&&!!b&&JSON.stringify(a)===JSON.stringify(b);}
