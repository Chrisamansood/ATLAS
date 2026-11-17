import { buildHive } from './stats.mjs';

// The roster is synthetic; only sandbox activity is observed at runtime.
export function standaloneHive(roster, local, sandbox, now = new Date()) {
  const pending = sandbox.approvals.filter(a => a.status === 'pending');
  const agents = roster.agents.map(a => ({ ...a, id: a.key, status: 'idle' }));
  const org = buildHive({
    company: { name: 'ATLAS Demo Organization', issuePrefix: 'demo' },
    dashboard: { agents: { active: 0, running: 0, paused: 0 }, tasks: {}, costs: {}, runActivity: [] },
    attention: { totalCount: pending.length, items: pending.map(a => ({ sourceKind: 'review', subject: { title: `${a.customer}: credit awaiting review`, href: '/twin/live#sandbox' } })) },
    agents,
  }, '', now);
  org.url = '/organization'; org.prefix = 'DEMO'; org.preview = true; org.stale = false;
  for (const row of [org.tree.lead, ...org.tree.departments.flatMap(d => [d.lead, ...d.agents]), ...org.tree.free].filter(Boolean)) row.href = `/organization#${row.id}`;
  org.wire = sandbox.calls.slice(0, 5).map(c => ({ text: `${c.agent ?? 'Unknown agent'}: ${c.tool}`, at: c.at, human: false, tokens: null }));
  org.pulse = JSON.stringify([sandbox.seq, pending.length, sandbox.calls.length]);
  return {
    asOf: now.toISOString(), mode: 'synthetic demo', synthetic: true,
    services: [{ key: 'twin', label: 'Local twin', ok: true }], org,
    companies: [{ name: org.company, prefix: 'DEMO', preview: true }],
    ...local, links: { org: '/organization', sim: null, langflow: null },
    sections: local.sections.map(s => ({ ...s, items: s.items.filter(i => i.key !== 'hive') })),
  };
}
