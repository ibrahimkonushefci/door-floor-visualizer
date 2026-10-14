import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Native anchors are required by BUILD_PLAN §3.2 for explicit static/offline navigation.
  { rules: { '@next/next/no-html-link-for-pages': 'off' } },
  // public/models holds the photo tool's third-party ONNX runtime, copied unchanged.
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts', '.claude/**', 'tools/blender/out/**', 'public/models/**']),
]);
