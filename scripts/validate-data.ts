import { loadSiteData } from '../src/lib/data/load';
import { checkDemoRoute, DEMO_ROUTE } from '../src/lib/studio/demo-route';
const data = loadSiteData();
const problems = checkDemoRoute({ products: data.products.products, materials: data.materials });
if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(
  `Data valid: ${data.products.products.length} products, ${data.materials.scenes.length} scenes; demo=${data.brand.demoMode}; demo route ${DEMO_ROUTE.length} stops`,
);
