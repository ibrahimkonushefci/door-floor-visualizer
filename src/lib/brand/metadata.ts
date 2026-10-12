import type { Metadata } from 'next';
import type { BrandConfig, Locale } from '../data/types';
import { localize } from '../i18n/messages';
export function buildMetadata(brand:BrandConfig,locale:Locale,path:string,title?:string,description?:string):Metadata{return {title:title?`${title} · ${brand.companyName}`:brand.companyName,description:description||localize(brand.tagline,locale),robots:brand.demoMode?{index:false,follow:false}:{index:true,follow:true},icons:{icon:brand.favicon},...(brand.siteUrl?{alternates:{canonical:new URL(path,brand.siteUrl).href}}:{})};}
