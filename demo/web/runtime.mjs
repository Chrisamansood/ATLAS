// Browser-only compatibility layer for the existing synthetic demo routes.
// No server, real agent credentials, filesystem access, or production enforcement.
const root = new URL('./engine/', import.meta.url).pathname;
let files = {}, state = {}, handler;
const key = p => String(p instanceof URL ? p.pathname : p).replace(root, '');
export function initialize(seed, saved) { files = seed; state = saved ?? {}; }
export function snapshot() { return state; }
export const fileURLToPath = u => u.pathname;
export const dirname = p => p.slice(0, p.lastIndexOf('/'));
export const join = (...p) => p.join('/');
export const mkdirSync = () => {};
export const existsSync = p => Object.hasOwn(state, key(p)) || Object.hasOwn(files, key(p));
export function readFileSync(p) { const k = key(p); if (!existsSync(p)) throw new Error(`Missing demo asset: ${k}`); return state[k] ?? files[k]; }
export function writeFileSync(p, value) { const k = key(p); if (!k.startsWith('.runtime/')) throw new Error('Read-only demo asset'); state[k] = String(value); }
export const readdirSync = p => Object.keys({...files, ...state}).filter(k => k.startsWith(key(p) + '/')).map(k => k.slice(key(p).length + 1)).filter(k => !k.includes('/'));
export const randomBytes = n => ({ toString: () => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('') });
export const createServer = fn => { handler = fn; return { listen: (_port, _host, ready) => ready() }; };
export async function dispatch(request, path) {
  const body = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
  return new Promise((resolve, reject) => {
    const listeners = {};
    const req = { url: path, method: request.method, headers: { ...Object.fromEntries(request.headers), host: 'localhost:3500', origin: 'http://localhost:3500' },
      on(name, cb) { listeners[name] = cb; if (name === 'end') queueMicrotask(() => { listeners.data?.(body); listeners.end(); }); }, destroy() {} };
    let status = 200, headers = {};
    const res = { writeHead(s, h = {}) { status = s; headers = h; }, end(body = '') { resolve({ status, headers, body }); } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
