import { loadSiteData } from '../src/lib/data/load';
const data = loadSiteData();
console.log(
  `Data valid: ${data.products.products.length} products, ${data.materials.scenes.length} scenes; demo=${data.brand.demoMode}`,
);
