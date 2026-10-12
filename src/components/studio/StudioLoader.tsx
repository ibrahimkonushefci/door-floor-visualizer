'use client';
import dynamic from 'next/dynamic';
import { createContext, useContext } from 'react';
import type { StudioCatalog } from '@/lib/studio/types';
import type { Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
const LoadingContext = createContext<{ catalog: StudioCatalog } | null>(null);
// Same geometry as the live Studio so nothing shifts when the client takes over.
function Loading() {
  const p = useContext(LoadingContext);
  if (!p) return null;
  const scene = p.catalog.materials.scenes[0];
  return (
    <section className="studio" aria-busy="true">
      <div className="studio-stage-area">
        <div className="studio-stage">
          <picture className="studio-fallback">
            <img src={scene.fallback} alt="" width={960} height={720} fetchPriority="high" />
          </picture>
          <span className="studio-progress" aria-hidden="true" />
        </div>
      </div>
      <aside className="studio-panel" />
    </section>
  );
}
const Client = dynamic(() => import('./StudioClient'), { ssr: false, loading: Loading });
export function StudioLoader(props: { catalog: StudioCatalog; locale: Locale; messages: Messages }) {
  return (
    <LoadingContext.Provider value={props}>
      <Client {...props} />
    </LoadingContext.Provider>
  );
}
