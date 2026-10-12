import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([...nextVitals,...nextTs,
// Native anchors are required by BUILD_PLAN §3.2 for explicit static/offline navigation.
{rules:{"@next/next/no-html-link-for-pages":"off"}},globalIgnores(['.next/**','out/**','next-env.d.ts'])]);
