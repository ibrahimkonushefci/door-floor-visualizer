'use client';
import dynamic from 'next/dynamic';import Image from 'next/image';import {createContext,useContext,useEffect} from 'react';
import {useInquiry} from '../inquiry/InquiryProvider';
import type { StudioCatalog } from '@/lib/studio/types';import type { Locale } from '@/lib/data/types';import type { Messages } from '@/lib/i18n/messages';
const LoadingContext=createContext<{catalog:StudioCatalog;messages:Messages}|null>(null);
function Loading(){const {setBlocked}=useInquiry();useEffect(()=>{setBlocked(true);return()=>setBlocked(false);},[setBlocked]);const p=useContext(LoadingContext);if(!p)return null;const scene=p.catalog.materials.scenes[0];return <div className="studio-stage"><Image src={scene.fallback} width={960} height={720} alt={p.messages['studio.defaultLoading']} priority/><p role="status">{p.messages['studio.defaultLoading']}</p></div>;}
const Client=dynamic(()=>import('./StudioClient'),{ssr:false,loading:Loading});
export function StudioLoader(props:{catalog:StudioCatalog;locale:Locale;messages:Messages}){return <LoadingContext.Provider value={props}><Client {...props}/></LoadingContext.Provider>;}
