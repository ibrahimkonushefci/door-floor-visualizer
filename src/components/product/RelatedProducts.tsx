import type { Locale } from '@/lib/data/types';
import type { ProductCardData } from '@/lib/media/types';
import { ProductGrid } from '../catalog/ProductGrid';
export function RelatedProducts({products,locale,title}:{products:readonly ProductCardData[];locale:Locale;title:string}){return products.length?<section className="related-products" aria-labelledby="related-title"><h2 id="related-title">{title}</h2><ProductGrid products={products} locale={locale}/></section>:null;}
