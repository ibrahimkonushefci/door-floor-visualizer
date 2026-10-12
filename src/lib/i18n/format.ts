import type { DoorSize, FloorCollection, Locale, OriginCountry } from '../data/types';
import { localize } from './messages';
export function formatDoorSize(size:DoorSize,locale:Locale):string {const fmt=new Intl.NumberFormat(locale);return `${fmt.format(size.leafWidthMm/10)} × ${fmt.format(size.leafHeightMm/10)} cm`;}
export function formatFloorSpec(collection:FloorCollection,locale:Locale):string {const thickness=new Intl.NumberFormat(locale).format(collection.thicknessMm);return collection.kind==='laminate'?`${thickness} mm · ${collection.acClass} · ${collection.usageClass}`:`${thickness} mm · ${localize(collection.woodSpecies,locale)}`;}
export function formatOrigin(country:OriginCountry|null,locale:Locale):string|null {if(!country)return null;return new Intl.DisplayNames([locale],{type:'region'}).of(country)||country;}
