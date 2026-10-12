import sqMessages from '../../../brand/messages/sq.json';
import enMessages from '../../../brand/messages/en.json';
import deMessages from '../../../brand/messages/de.json';
import type { Locale, LocalizedText } from '../data/types';
export type Messages = Record<keyof typeof sqMessages,string>;
const dictionaries:Record<Locale,Messages>={sq:sqMessages,en:enMessages,de:deMessages};
export function localize(value:LocalizedText,locale:Locale):string {return value[locale]?.trim()||value.sq.trim();}
export function getMessages(locale:Locale):Messages {const merged={...sqMessages};for(const key of Object.keys(sqMessages) as (keyof Messages)[]){const text=dictionaries[locale][key];if(text.trim())merged[key]=text;}return merged;}
export function validateMessages(requireAll=false){const keys=Object.keys(sqMessages);for(const [locale,dictionary] of Object.entries(dictionaries)){if(Object.keys(dictionary).length!==keys.length||keys.some(k=>!Object.hasOwn(dictionary,k)))throw new Error(`messages.${locale}: key mismatch`);for(const value of Object.values(dictionary))if(typeof value!=='string'||((requireAll||locale==='sq')&&!value.trim()))throw new Error(`messages.${locale}: invalid translation`);}}
