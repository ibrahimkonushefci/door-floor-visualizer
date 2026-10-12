'use client';
import { useOffline } from './OfflineProvider';
import type { OfflineState } from '@/lib/offline/messages';
import type { Messages } from '@/lib/i18n/messages';
export function OfflineStatus({state,onUpdate,messages:m}:{state:OfflineState;onUpdate:()=>void;messages:Messages}){return <><p role="status">{m[`offline.${state}`]}</p>{state==='update-available'&&<button onClick={onUpdate}>{m['offline.update']}</button>}</>;}

export function GlobalOfflineStatus({messages}:{messages:Messages}){const o=useOffline();if(!['offline','update-available'].includes(o.state)||(typeof window!=='undefined'&&window.location.pathname.includes('/studio/')))return null;return <aside className="offline-controls"><OfflineStatus state={o.state} onUpdate={o.update} messages={messages}/></aside>;}
