'use client';
import { useState } from 'react';
import type { ContactAction } from '@/lib/inquiry/types';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { copyInquiryText } from '@/lib/inquiry/links';
import { useInquiry } from './InquiryProvider';
export function InquiryDialog({action,onClose}:{action:ContactAction|null;onClose:()=>void}){
 const {messages:m,data,channel}=useInquiry();const [copyState,setCopyState]=useState<'idle'|'copied'|'failed'>('idle');
 const text=action?.kind==='preview'?action.copyText:action?.fullMessage||'';
 async function copy(){setCopyState(await copyInquiryText(text,navigator.clipboard)?'copied':'failed');}
 return <Dialog open={action!==null} title={m['contact.demoTitle']} onClose={()=>{setCopyState('idle');onClose();}}><button className="dialog-close icon-button" onClick={()=>{setCopyState('idle');onClose();}} aria-label={m['common.close']} autoFocus><Icon name="close"/></button><p>{data.brand.demoMode?m['contact.demoBody']:m['inquiry.viber']}</p><p className="recipient">{m['contact.recipient']}: {data.brand.contact[channel]||'—'}</p><textarea aria-label={m['contact.copy']} readOnly value={text} rows={5}/><div className="dialog-actions"><button className="primary-button" onClick={copy}><Icon name="copy"/>{m['contact.copy']}</button>{action?.kind==='external'&&<a className="plain-button" href={action.href}>{m['contact.viber']}</a>}</div><p className="copy-status" role="status">{copyState==='copied'?m['contact.copied']:copyState==='failed'?m['contact.selectCopy']:''}</p></Dialog>;
}
