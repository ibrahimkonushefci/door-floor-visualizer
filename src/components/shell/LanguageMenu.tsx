'use client';
import { useEffect,useRef,useState } from 'react';
import type { Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import { locales,localeHref } from '@/lib/i18n/locales';
export function LanguageMenu({locale,messages}:{locale:Locale;messages:Messages}){
 const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);const button=useRef<HTMLButtonElement>(null);
 const [links,setLinks]=useState<Record<Locale,string>>({sq:'/sq/',en:'/en/',de:'/de/'});
 useEffect(()=>{const refresh=()=>setLinks(Object.fromEntries(locales.map(l=>[l,localeHref(window.location.pathname,new URLSearchParams(window.location.search),l)])) as Record<Locale,string>);refresh();window.addEventListener('popstate',refresh);window.addEventListener('pd:querychange',refresh);return()=>{window.removeEventListener('popstate',refresh);window.removeEventListener('pd:querychange',refresh);};},[]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);ref.current?.querySelector<HTMLAnchorElement>('a[aria-current]')?.focus();return()=>document.removeEventListener('pointerdown',outside);},[open]);
 return <div className="language-menu" ref={ref} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)&&open){e.preventDefault();const options=Array.from(ref.current!.querySelectorAll('a'));const index=options.indexOf(document.activeElement as HTMLAnchorElement);options[e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowDown'?1:2))%3]?.focus();}}}><button ref={button} className="icon-button language-toggle" aria-label={`${messages['nav.language']}: ${locale.toUpperCase()}`} aria-expanded={open} aria-controls="language-options" onClick={()=>setOpen(!open)}>{locale.toUpperCase()}</button>{open&&<nav id="language-options" aria-label={messages['nav.language']} className="language-options">{locales.map(l=><a key={l} href={links[l]} lang={l} aria-current={l===locale?'page':undefined}>{l.toUpperCase()}</a>)}</nav>}</div>;
}
