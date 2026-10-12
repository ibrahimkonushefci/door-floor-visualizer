import type { ResponsiveImageData } from '@/lib/media/types';
export function ResponsiveImage({image,sizes,eager=false,fit='cover',priority=false}:{image:ResponsiveImageData;sizes:string;eager?:boolean;fit?:'cover'|'contain';priority?:boolean}) {
  const sourceSet=(variants:ResponsiveImageData['avif'])=>variants.map(v=>`${v.src} ${v.width}w`).join(', ');
  return <picture>
    <source type="image/avif" srcSet={sourceSet(image.avif)} sizes={sizes}/>
    <source type="image/webp" srcSet={sourceSet(image.webp)} sizes={sizes}/>
    {/* Static local derivatives are intentional: there is no image optimizer at deployment. */}
    <img src={image.fallback.src} srcSet={sourceSet(image.webp)} sizes={sizes} width={image.width} height={image.height} alt={image.alt} loading={eager?'eager':'lazy'} fetchPriority={priority?'high':'auto'} decoding="async" style={{objectFit:fit,objectPosition:`${image.focalPoint[0]*100}% ${image.focalPoint[1]*100}%`}}/>
  </picture>;
}
