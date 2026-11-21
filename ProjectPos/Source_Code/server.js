import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PosStore, BusinessError } from './src/store.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.POS_DATA_DIR?path.resolve(process.env.POS_DATA_DIR):path.join(root,'data');
mkdirSync(dataDir,{recursive:true});
const store=new PosStore(path.join(dataDir,'pos.sqlite'));
const port=Number(process.env.PORT||3000);
const files={'/english.css':['public/english.css','text/css; charset=utf-8'],'/':['public/index.html','text/html; charset=utf-8'],'/app.js':['public/app.js','text/javascript; charset=utf-8'],'/style.css':['public/style.css','text/css; charset=utf-8'],'/terminal.css':['public/terminal.css','text/css; charset=utf-8'],'/favicon.svg':['public/favicon.svg','image/svg+xml']};
async function body(req) {
  let data='';
  for await(const chunk of req) { data+=chunk; if(Buffer.byteLength(data)>65536) throw new BusinessError('Request is too large'); }
  try {return JSON.parse(data);} catch {throw new BusinessError('Invalid JSON request');}
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  try {
    const url=new URL(req.url,'http://localhost');
    const pathname=url.pathname;
    if(pathname.startsWith('/api/')) {
      res.setHeader('Cache-Control','no-store');
      if(req.method!=='GET') {
        const origin=req.headers.origin;
        if(origin && origin!==`http://${req.headers.host}`) {res.writeHead(403);res.end();return;}
        if(!req.headers['content-type']?.startsWith('application/json')) throw new BusinessError('Use a JSON request');
      }
      let result;
      if(req.method==='GET' && pathname==='/api/products') result=store.products();
      else if(req.method==='GET' && pathname==='/api/summary') result=store.summary();
      else if(req.method==='GET' && pathname==='/api/sales') result=store.sales();
      else if(req.method==='GET' && pathname==='/api/stock-logs') result=store.logs();
      else if(req.method==='GET' && /^\/api\/sales\/[^/]+$/.test(pathname)) result=store.sale(decodeURIComponent(pathname.split('/')[3]));
      else if(req.method==='POST' && pathname==='/api/sales') result=store.checkout(await body(req));
      else if(req.method==='POST' && /^\/api\/sales\/[^/]+\/refunds$/.test(pathname)) result=store.refund(decodeURIComponent(pathname.split('/')[3]),await body(req));
      else if(req.method==='POST' && pathname==='/api/products') result=store.saveProduct(await body(req));
      else if(req.method==='PUT' && /^\/api\/products\/[^/]+$/.test(pathname)) result=store.saveProduct(await body(req),decodeURIComponent(pathname.split('/')[3]));
      else if(req.method==='POST' && /^\/api\/products\/[^/]+\/stock$/.test(pathname)) result=store.adjust(decodeURIComponent(pathname.split('/')[3]),await body(req));
      else {res.writeHead(404,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'Endpoint not found'}));return;}
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(result));
    } else if(req.method==='GET' && files[pathname]) {
      const [file,type]=files[pathname];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(readFileSync(path.join(root,file)));
    } else {res.writeHead(404);res.end('Not found');}
  } catch(error) {
    if(!(error instanceof BusinessError)) console.error(error);
    res.writeHead(error instanceof BusinessError?400:500,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({error:error instanceof BusinessError?error.message:'Server error. Please try again.'}));
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`\n  Qinghe POS started\n  Open in your browser: http://127.0.0.1:${port}\n  Press Ctrl+C to stop the server\n`));
process.on('SIGINT',()=>server.close(()=>{store.close();process.exit(0);}));
