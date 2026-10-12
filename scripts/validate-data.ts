import { loadSiteData,IMPLEMENTATION_PHASE } from '../src/lib/data/load';
import { parsePhase } from '../src/lib/data/validate';
const phase=parsePhase(process.argv.slice(2),IMPLEMENTATION_PHASE);
const data=loadSiteData(phase);
console.log(`Phase ${phase} data valid: ${data.products.products.length} products, ${data.materials.scenes.length} scenes; demo=${data.brand.demoMode}`);
