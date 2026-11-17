#!/usr/bin/env node
// Reuse the tested local routes in a browser service worker. Only allowlisted
// demo source/fixtures enter the public build; .runtime and secrets never do.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTheme } from '../hive/lib/themes.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist');
const base = process.env.PAGES_BASE_PATH ?? '/ATLAS/';
if (!/^\/[a-zA-Z0-9/_-]*\/$/.test(base)) throw new Error('Expected an absolute base path ending in /');
rmSync(out, {recursive:true, force:true}); mkdirSync(out, {recursive:true});
const write = (p,s) => { const target=resolve(out,p); mkdirSync(dirname(target),{recursive:true}); writeFileSync(target,s); };
function publicText(text) {
  return text.replace('Agents that speak MCP use ', 'Browser-local MCP simulation: ').replace(' with their own token; calls appear in the Agent sandbox log.', ' — this public site does not expose a remote MCP server. Calls appear in the sandbox log.').replace('curl ${location.origin}', 'Browser demo: ${location.origin}').replace(/(["'`])\/(hive|twin|organization|data|shared|decisions|api|mock)(?=[/?#"'`])/g, `$1${base}$2`)
    .replace(/href="\/(\?|"|#)/g, `href="${base}ontology/$1`)
    .replace('s.value === "telco" ? "/" : `/?industry=', `s.value === "telco" ? "${base}ontology/" : \`${base}ontology/?industry=`);
}
const html = text => publicText(text).replace(/<head>/i, `<head><link rel="icon" href="data:,"><script src="${base}bootstrap.js"></script>`);
const files = {};
const walk = dir => { for (const entry of readdirSync(resolve(root,dir),{withFileTypes:true})) {
  const p = `${dir}/${entry.name}`;
  if (entry.isDirectory()) { if (!['tests','results'].includes(entry.name)) walk(p); continue; }
  if (!/\.(json|html|mjs|js)$/.test(p)) continue;
  let s = readFileSync(resolve(root,p),'utf8');
  // Keep API paths in route code unchanged; transform only browser-facing assets.
  files[p] = /\.(html|js)$/.test(p) ? (p.endsWith('.html') ? html(s) : publicText(s)) : s;
  if (p.endsWith('.mjs')) {
    const shim = relative(dirname(p), '../runtime.mjs');
    s = s.replace(/from "node:(fs|path|crypto|url|http)"/g, `from "${shim}"`);
    if (p === 'scripts/ontology-serve.mjs') s = s.replace(/process\.env/g, '({})');
    write(`engine/${p}`, s);
  }
} };
for (const dir of ['seed','skills','hive','twin','ontology','decision','shared']) walk(dir);
// Only this server entrypoint; never bundle build scripts or working files.
let server = readFileSync(resolve(root,'scripts/ontology-serve.mjs'),'utf8').replace(/from "node:(fs|url|http)"/g, 'from "../../runtime.mjs"').replace(/process\.env/g,'({})');
server = server.replace('const root =', 'export function startServer() {\nconst root =') + '\n}';
write('engine/scripts/ontology-serve.mjs', server);
// Registry links are rebased at response time, not twice at build time.
write('files.json', JSON.stringify(files));
for (const p of ['runtime.mjs','service-worker.mjs','bootstrap.js']) write(p,readFileSync(resolve(root,'web',p),'utf8'));
const sphere = html(renderTheme(resolve(root,'hive/ui')+'/', 'sphere'));
write('index.html',sphere); write('hive/index.html',sphere);
for (const [route,source] of Object.entries({ontology:'ontology/index.html',organization:'hive/ui/organization.html',decisions:'decision/ui/index.html',twin:'twin/ui/index.html','twin/live':'twin/ui/live.html','twin/office':'twin/ui/office.html','twin/crm':'twin/ui/crm.html','twin/catalogue':'twin/ui/catalogue.html','hive/v3':'hive/ui/index.html'})) write(`${route}/index.html`, html(readFileSync(resolve(root,source),'utf8')));
write('shared/platform-nav.js',publicText(readFileSync(resolve(root,'shared/platform-nav.js'),'utf8')));
write('decisions/replay.mjs',readFileSync(resolve(root,'decision/lib/replay.mjs'),'utf8'));
const version = createHash('sha256').update(JSON.stringify(files)).update(server).digest('hex').slice(0,16);
write('service-worker.mjs', readFileSync(resolve(root,'web/service-worker.mjs'),'utf8') + `\n// Build ${version}\n`);
write('.nojekyll','');
console.log(`Built ATLAS HIVE for ${base} in ${out}`);
