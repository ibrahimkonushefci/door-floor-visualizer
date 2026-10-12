'use client';
import { Fragment,useEffect,useRef,useState,type ReactNode } from 'react';
import type PhotoSwipe from 'photoswipe';
import type { ResponsiveImageData } from '@/lib/media/types';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { useInquiry } from '../inquiry/InquiryProvider';
// Optional facts slot preserves the public gallery call and puts mobile reading/focus order first.
export function ProductGallery({images,productName,children}:{images:readonly ResponsiveImageData[];productName:string;children?:ReactNode}){
 const {messages:m}=useInquiry();const instance=useRef<PhotoSwipe|null>(null);const mounted=useRef(true);const opening=useRef(false);const [error,setError]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;instance.current?.destroy();instance.current=null;};},[]);
 async function open(index:number,trigger:HTMLButtonElement){
  if(opening.current||instance.current)return;opening.current=true;setError(false);
  try{
   const [{default:Gallery}]=await Promise.all([import('photoswipe'),import('photoswipe/style.css')]);if(!mounted.current)return;
   const gallery=new Gallery({index,mainClass:'product-lightbox',dataSource:images.map(image=>{const large=image.webp.at(-1)!;return {src:large.src,width:large.width,height:large.height,alt:image.alt};}),preload:[0,0],showHideAnimationType:'none',returnFocus:false,trapFocus:true,closeTitle:m['common.close'],zoomTitle:m['product.zoom'],arrowPrevTitle:m['product.previous'],arrowNextTitle:m['product.next'],errorMsg:m['product.galleryError']});
   instance.current=gallery;gallery.on('destroy',()=>{instance.current=null;if(mounted.current&&trigger.isConnected)trigger.focus({preventScroll:true});});gallery.init();
  }catch{instance.current?.destroy();instance.current=null;if(mounted.current)setError(true);}finally{opening.current=false;}
 }
 return <div className={`product-gallery${children?' has-facts':''}`} aria-label={productName}>{images.map((image,index)=><Fragment key={image.id}><button className="gallery-photo" aria-label={`${m['product.zoom']}: ${productName} (${index+1}/${images.length})`} onClick={e=>void open(index,e.currentTarget)}><ResponsiveImage image={image} sizes="(min-width:1200px) 760px, (min-width:768px) 60vw, 100vw" eager={index===0} priority={index===0} fit="contain"/><span className="gallery-zoom-label">{m['product.zoom']}</span></button>{index===0&&children}</Fragment>)}{error&&<p className="gallery-error" role="status">{m['product.galleryError']}</p>}</div>;
}
