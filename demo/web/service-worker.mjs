import { startServer } from './engine/scripts/ontology-serve.mjs';
import { initialize, snapshot, dispatch } from './runtime.mjs';
const base = new URL('./', import.meta.url).pathname;
const database = new Promise((resolve, reject) => {
  const r = indexedDB.open('atlas-demo-v1', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('state');
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
});
async function load() {
  const db = await database;
  return new Promise((resolve, reject) => { const r = db.transaction('state').objectStore('state').get('runtime'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
async function save() {
  const db = await database;
  return new Promise((resolve, reject) => { const t = db.transaction('state', 'readwrite'); t.objectStore('state').put(snapshot(), 'runtime'); t.oncomplete = resolve; t.onerror = () => reject(t.error); });
}
const ready = (async () => {
  const assets = await fetch(new URL('./files.json', import.meta.url), {cache:'no-store'});
  if (!assets.ok) throw new Error('Demo assets unavailable');
  initialize(await assets.json(), await load());
  startServer();
})();
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
function links(value, name = '') {
  if (typeof value === 'string' && /^(href|url|base|spec)$/.test(name) && value.startsWith('/') && !value.startsWith('//')) return value === '/' || value.startsWith('/?') ? base + 'ontology/' + value.slice(1) : base + value.slice(1);
  if (Array.isArray(value)) return value.map(v => links(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, links(v,k)]));
  return value;
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(base)) return;
  let path = '/' + url.pathname.slice(base.length).replace(/\/$/, '');
  if (/^\/(engine|files\.json|runtime\.mjs|service-worker\.mjs|bootstrap\.js|favicon\.ico)/.test(path)) return;
  if (path === '/' || path === '/index.html') path = '/hive';
  if (path === '/ontology') path = '/';
  event.respondWith((async () => {
    try {
      await ready;
      const result = await dispatch(event.request, path + url.search);
      if (!['GET','HEAD'].includes(event.request.method)) await save();
      if (result.headers['content-type']?.includes('application/json')) result.body = JSON.stringify(links(JSON.parse(result.body)));
      return new Response(event.request.method === 'HEAD' ? null : result.body, { status: result.status, headers: result.headers });
    } catch (error) { return new Response('ATLAS demo could not start. Reload, or allow browser storage for this site. ' + error.message, {status: 503}); }
  })());
});
