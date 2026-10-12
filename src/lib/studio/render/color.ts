import type { RGB } from '../../data/types';
export const clamp=(x:number,min=0,max=1)=>Math.max(min,Math.min(max,x));
export function srgbToLinear(v:number){return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}
export function linearToSrgb(v:number){return v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;}
export function luminance(c:RGB){return .2126*c[0]+.7152*c[1]+.0722*c[2];}
export const decode=Float32Array.from({length:256},(_,i)=>srgbToLinear(i/255));
const encode=Float32Array.from({length:8193},(_,i)=>linearToSrgb(i/8192)*255);
export function encodeByte(v:number){const x=clamp(v)*8192,i=Math.floor(x);return Math.round(encode[i]+((encode[Math.min(i+1,8192)]-encode[i])*(x-i)));}
export function hexLinear(hex:string):RGB{return [decode[parseInt(hex.slice(1,3),16)],decode[parseInt(hex.slice(3,5),16)],decode[parseInt(hex.slice(5,7),16)]];}
