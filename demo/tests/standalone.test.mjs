import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { standaloneHive } from '../hive/lib/standalone.mjs';

let child, base, output = '', state;
before(async () => {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  state = mkdtempSync(`${tmpdir()}/atlas-demo-test-`); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['scripts/ontology-serve.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PORT: String(port), ATLAS_DEMO_DATA_DIR: state }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Demo did not start: ${output}`);
});
after(async () => {
  if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; }
  if (state) rmSync(state, { recursive: true, force: true });
});

test('all included screens and five themes work without external services', async () => {
  const paths = ['/', '/organization', '/twin', '/twin/live', '/twin/office', '/twin/catalogue', '/twin/crm', '/decisions', ...['sphere','constellation','globe','hud','swarm'].map(t => `/hive?theme=${t}`)];
  for (const path of paths) {
    const r = await fetch(base + path); assert.equal(r.status, 200, path);
    const html = await r.text(); assert.match(html, /ATLAS/, path);
    assert.doesNotMatch(html, /qvantel|localhost:(3000|3100|3200|7860|8090)|127\.0\.0\.1:8090/i, path);
  }
  const hive = await (await fetch(base + '/data/hive.json')).json();
  assert.equal(hive.synthetic, true); assert.equal(hive.mode, 'synthetic demo');
  assert.equal(hive.org.agents.running, 0); assert.ok(hive.org.tree.total > 20);
  assert.equal(hive.links.sim, null); assert.equal(hive.links.langflow, null);
  for (const sec of hive.sections) for (const item of sec.items) {
    assert.ok(item.href.startsWith('/')); assert.equal((await fetch(base + item.href)).status, 200, item.href);
  }
  const glossary = await (await fetch(base + '/data/ontology.json')).json();
  assert.deepEqual(glossary.validationErrors, []); assert.equal(glossary.pack, null);
  assert.equal((await (await fetch(base + '/data/decisions.json')).json()).hasData, false);
});

test('replay and sandbox authorization work locally; foreign writes fail', async () => {
  const replay = await fetch(base + '/twin/api/replay?agent=bill-shock');
  assert.equal(replay.status, 200); assert.ok((await replay.json()).baseline);
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const unknown = await post('/twin/api/live/demo', { as: 'unknown', customer: 'NW-100000', amount: '20' });
  assert.equal((await unknown.json()).refused, true);
  assert.equal((await post('/twin/api/live/reset', {}, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await post('/twin/api/live/reset', {})).status, 200);
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = request(base + '/healthz', { headers: { Host: 'example.com' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(badHostStatus, 403);
});

test('HIVE shows actual pending sandbox reviews with local links', () => {
  const roster = JSON.parse(readFileSync(new URL('../seed/nordwave-roster.json', import.meta.url)));
  const payload = standaloneHive(roster, { sections: [] }, { approvals: [{ status: 'pending', customer: 'NW-100000' }], calls: [], seq: 1 });
  assert.equal(payload.org.attention.total, 1);
  assert.equal(payload.org.attention.items[0].href, '/twin/live#sandbox');
  assert.ok(payload.org.tree.departments.every(d => d.lead.href.startsWith('/organization#')));
});
