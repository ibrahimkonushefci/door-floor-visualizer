import type { RoomScene,Locale } from '@/lib/data/types';
import { localize } from '@/lib/i18n/messages';
export function ScenePicker({scenes,value,locale,onChange}:{scenes:readonly RoomScene[];value:string;locale:Locale;onChange:(id:string)=>void}){return <div className="scene-picker" role="group" aria-label={locale==='sq'?'Dhoma':locale==='de'?'Raum':'Room'}>{scenes.map(s=><button key={s.id} aria-pressed={s.id===value} onClick={()=>onChange(s.id)}>{localize(s.name,locale)}</button>)}</div>;}
