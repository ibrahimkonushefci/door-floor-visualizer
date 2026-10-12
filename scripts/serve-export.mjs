import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,relative,extname,sep } from 'node:path';
import { pathToFileURL } from 'node:url';
export function resolveExportPath(root,reference,base='/'){
 if(/^[a-z][a-z0-9+.-]*:/i.test(reference)||reference.startsWith('//'))return null;
 const raw=reference.split(/[?#]/,1)[0];const decoded=decodeURIComponent(raw);
 if(decoded.includes('\0')||decoded.includes('\\')||(decoded.startsWith('/')&&decoded.split('/').some(v=>v==='..'||v==='.')))throw new Error('Unsafe path');
 const baseDirectory=base.endsWith('/')?base:base.slice(0,base.lastIndexOf('/')+1);
 const pathname=decoded.startsWith('/')?decoded:baseDirectory+decoded;
 const target=resolve(root,'.'+pathname);const rel=relative(root,target);
 if(rel==='..'||rel.startsWith('..'+sep))throw new Error('Path escapes export');return target;
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};
export function createExportServer(root){return createServer(async(req,res)=>{res.setHeader('Cache-Control','no-cache');if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}let target;try{target=resolveExportPath(root,req.url||'/');if(!target)throw new Error('Invalid request');}catch{res.writeHead(400);res.end('Invalid path');return;}let code=200;try{if((await stat(target)).isDirectory())target=resolve(target,'index.html');await stat(target);}catch{if(extname(target)&&extname(target)!=='.html'){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?undefined:'Not found');return;}target=resolve(root,'404.html');code=404;}try{const content=await readFile(target);res.writeHead(code,{'Content-Type':mime[extname(target)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:content);}catch{res.writeHead(404);res.end('Not found');}});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2);const flag=(name,fallback)=>{const i=args.lastIndexOf(name);return i>=0?args[i+1]:fallback;};const host=flag('--host','127.0.0.1');const port=Number(flag('--port','4173'));createExportServer(resolve('out')).listen(port,host,()=>console.log(`Static preview: http://${host}:${port}/sq/`));}
