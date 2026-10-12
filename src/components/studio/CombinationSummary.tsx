import type { StudioSelection } from '@/lib/data/types';
export function CombinationSummary({selection,title,pending}:{selection:StudioSelection|null;title:string;pending:boolean}){return <p className="combination-summary" aria-live="polite" data-rendered-selection={selection?JSON.stringify(selection):''} aria-busy={pending}>{title}</p>;}
