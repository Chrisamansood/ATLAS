// Ask HIVE (P0-40), inlined into every theme by hive/lib/themes.mjs after the theme picker.
// Hold Space to ask by voice (the browser's own speech recognition); where the browser has none, Space or a click on the tab opens a box to type.
// HIVE answers from /data/hive.json with scripted lines (no model; every figure is read from the data, nothing is computed here),
// speaks with the browser's speech synthesis and publishes window.HIVE_VOICE.level (0..1) so a theme can pulse its sphere.
// A theme that draws its own pulse sets window.HIVE_VOICE_NATIVE = true; any other gets a mint glow on its largest canvas.
(() => {
  const num = (x) => Number(x ?? 0).toLocaleString("en-GB");
  const count = (k, one, many = one + "s") => `${num(k)} ${Number(k) === 1 ? one : many}`;
  const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs.at(-1));
  const tokens = (k) => (k >= 1e6 ? `${(k / 1e6).toFixed(1)} million` : k >= 1e3 ? `about ${Math.round(k / 1e3)} thousand` : num(k));
  const model = (m) => String(m ?? "an unrecorded model").replace(/-/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const ago = (at, now) => {
    const m = Math.max(0, Math.round((now - Date.parse(at)) / 60000));
    return m < 2 ? "just now" : m < 60 ? `${m} minutes ago` : m < 1440 ? count(Math.round(m / 60), "hour") + " ago" : count(Math.round(m / 1440), "day") + " ago";
  };
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[.?!]$/, "");

  const title = (s) => String(s ?? "").replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const KIT = { sim: "Agent Builder 1", langflow: "Agent Builder 2", claude_code: "Claude Code", codex: "Codex" };   // never the builder product names
  const STATES = [["working", "working"], ["blocked", "blocked"], ["review", "in review"], ["idle", "idle"], ["paused", "paused"]];
  const tally = (agents) => STATES.map(([k, say]) => [agents.filter((a) => a.state === k).length, say]).filter(([k]) => k).map(([k, say]) => `${k} ${say}`);
  const depts = (d) => d.org.tree?.departments ?? [];
  const deptIn = (q, d) => depts(d).find((x) => new RegExp(`\\b${x.name.toLowerCase()}\\b`).test(q));
  const HELP = "Try: what needs me, what's blocked, how much did we spend, what happened lately, which department is busiest, tell me about Marketing, what was the last run, are all systems up, how is HIVE governed, or what are the agents built with.";

  // First match wins, so the narrower questions come first ("is Jarvis blocked" is about Jarvis, "how many customers" about the twin).
  // An intent matches by regular expression (re) or by a function of the question and the data (match).
  const INTENTS = [
    { id: "intro", re: /who are you|what are you|what is hive|introduce|^(hi|hello|hey)\b/, say: (d) =>
      `I'm HIVE, the co-operating system for ${d.org.company}, where ${count(d.org.agents?.total, "agent")} and the people who guide them work as one. Ask me what needs you, what's blocked, or what we spent.` },
    { id: "help", re: /what can (you|i)|help|examples?|which questions/, say: () => HELP },
    { id: "thanks", re: /thank|cheers|good ?bye|^bye|that's all/, say: () => "Any time. I'll keep watch." },
    { id: "health", re: /systems?|services?|health|(everything|all) (up|ok|okay|running|working)|online|offline|\bdown\b/, say: (d) => {
      const s = d.services ?? [], down = s.filter((x) => !x.ok).map((x) => x.label);
      if (!s.length) return "I can't see the systems right now.";
      return down.length ? `${list(down)} ${down.length === 1 ? "is" : "are"} down. The other ${count(s.length - down.length, "system")} ${s.length - down.length === 1 ? "is" : "are"} up.`
        : `${s.length === 1 ? "The one system is" : `All ${s.length} systems are`} up: ${list(s.map((x) => x.label))}.`;
    } },
    { id: "ontology", re: /ontolog|industr|engines?|decision models?/, say: (d) =>
      `The ontology covers ${count(d.counts?.industries, "industry", "industries")}, so a different industry gives a different organization. ${count(d.counts?.engines, "decision engine")} ${d.counts?.engines === 1 ? "is" : "are"} compared on the Decisions page.` },
    { id: "companies", re: /compan(y|ies)|other org|which orgs?|organi[sz]ations\b/, say: (d) => {
      const c = d.companies ?? [];
      return c.length ? `HIVE can show ${count(c.length, "organization")}: ${list(c.map((x) => x.name))}. You're looking at ${d.org.company}.` : `You're looking at ${d.org.company}.`;
    } },
    { id: "attention", re: /needs? me|attention|waiting (on|for) me|for me|approv|my (desk|queue|inbox)|decisions?/, say: (d) => {
      const a = d.org.attention ?? {}, items = a.items ?? [], k = a.total ?? items.length;
      if (!k) return "Nothing needs you right now. The agents have it.";
      const first = items[0] ? ` First: ${clean(items[0].title)}.` : "", then = items[1] ? ` Then: ${clean(items[1].title)}.` : "";
      return `${count(k, "thing")} ${k === 1 ? "needs" : "need"} you.${first}${then}`;
    } },
    { id: "jarvis", re: /jarvis|chief of staff/, say: (d) => {
      const j = (d.org.tree?.free ?? []).find((a) => /jarvis/i.test(a.name));
      return j ? `Jarvis, the chief of staff, is ${j.state === "blocked" ? "blocked and waiting on a person" : j.state} right now.` : "Jarvis isn't in this organization.";
    } },
    { id: "twin", re: /twin|customers?|catalog|offers?/, say: (d) =>
      `The twin holds ${num(d.twin?.customers)} synthetic customers and ${count(d.twin?.offers, "live offer")}, with ${count(d.twin?.drafts, "draft")} waiting for review. Agents rehearse there before they touch anything real.` },
    { id: "busiest", re: /busiest|biggest|largest|most agents|which (department|team)/, say: (d) => {
      const ds = depts(d);
      if (!ds.length) return "There are no departments yet.";
      const big = ds.reduce((a, b) => ((b.agents?.length ?? 0) > (a.agents?.length ?? 0) ? b : a));
      const live = ds.map((x) => [x, (x.agents ?? []).filter((a) => a.state === "working").length]).sort((a, b) => b[1] - a[1])[0];
      return `${big.name} is the biggest team, with ${count(big.agents?.length ?? 0, "agent")}. ` +
        (live[1] ? `${live[0].name} is busiest right now, with ${count(live[1], "agent")} working.` : "Right now no department has an agent mid-run.");
    } },
    { id: "department", match: deptIn, say: (d, now, q) => {
      const x = deptIn(q, d), ag = x.agents ?? [], t = tally(ag);
      return `${x.name} has ${count(ag.length, "agent")}${x.lead?.name ? `, led by ${x.lead.name}` : ""}${t.length ? ": " + list(t) : ""}.`;
    } },
    { id: "lastrun", re: /last run|latest run|running (right )?now|right now|currently|\blive\b|last (job|agent)/, say: (d, now) => {
      const io = d.org.io ?? {}, live = io.live ?? [], l = io.last;
      const nowLine = live.length ? `${count(live.length, "agent")} ${live.length === 1 ? "is" : "are"} running right now: ${list(live.slice(0, 3).map((r) => r.agent ?? r.name))}.` : "Nothing is running right now.";
      if (!l) return nowLine;
      return `${nowLine} The last run was ${l.agent}, ${ago(l.at, now)}, on ${model(l.model)}. It ${l.status === "succeeded" ? "succeeded" : l.status}, reading ${tokens(l.inTokens ?? 0)} tokens and writing ${tokens(l.outTokens ?? 0)}, for $${Number(l.costUsd ?? 0).toFixed(2)}.`;
    } },
    { id: "directives", re: /working on|priorit|directives?|focus|top tasks?|agenda/, say: (d) => {
      const ds = (d.org.directives ?? []).slice(0, 3);
      if (!ds.length) return "There are no open directives.";
      return `Top of the list: ` + ds.map((x) => `${clean(x.title)}, ${String(x.status).replace(/_/g, " ")}${x.agent ? ` with ${x.agent}` : ""}`).join(". Then: ") + ".";
    } },
    { id: "pipeline", re: /pipeline|in progress|in review|queued?|backlog|\bdone\b|finished|completed/, say: (d) => {
      const p = d.org.pipeline ?? {};
      return `The pipeline: ${num(p.queued)} queued, ${num(p.inProgress)} in progress, ${num(p.review)} in review, ${num(p.blocked)} blocked and ${num(p.done)} done.`;
    } },
    { id: "builders", re: /builders?|kits?|built (with|on)|platforms?|claude code|codex|frameworks?/, say: (d) => {
      const k = (d.kits ?? []).filter((x) => x.count);
      if (!k.length) return "No agents from outside kits are registered yet.";
      return `Agents here come from ${count(k.length, "kit")}: ${list(k.map((x) => `${x.count} from ${KIT[x.kit] ?? title(x.kit)}`))}. HIVE governs every one of them the same way.`;
    } },
    { id: "tools", re: /tool calls?|tools?|calling|\bmcp\b|\bcalls?\b/, say: (d, now) => {
      const c = d.calls?.calls ?? [];
      if (!c.length) return "No tool calls on record yet.";
      const seen = [...new Set(c.slice(0, 6).map((x) => title(x.target)))];
      return `The latest tool calls came from ${title(c[0].agent)}, ${ago(c[0].at, now)}: ${list(seen.slice(0, 3))}.${d.calls?.perMin ? ` About ${d.calls.perMin} calls a minute right now.` : ""}`;
    } },
    { id: "success", re: /success|reliab|fail(ure)? rate|quality|how well/, say: (d) =>
      `${d.org.kpi?.success14 ?? 0} percent of runs succeeded over the last 14 days.` },
    { id: "runs", re: /how many runs|\bruns\b|activity|how busy/, say: (d) => {
      const r = (d.org.runs ?? []).slice(-7), total = r.reduce((a, x) => a + (x.total ?? 0), 0), best = r.reduce((a, x) => ((x.total ?? 0) > (a?.total ?? -1) ? x : a), null);
      const day = best?.total ? new Date(best.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }) : null;
      return `${count(total, "run")} in the last 7 days, ${num(d.org.kpi?.runsToday)} today.${day ? ` The busiest day was ${day}, with ${count(best.total, "run")}.` : ""}`;
    } },
    { id: "governance", re: /govern|rules?|safe|control|guardrails?|audit|trust|in charge|oversight/, say: (d, now) => {
      const a = d.org.audit ?? [], people = a.filter((x) => x.human).length, last = a[0];
      return `Every hire and every risky action passes a gate, and each one is logged.${a.length ? ` ${count(a.length, "event")} on the recent audit trail, ${num(people)} of them by a person.` : ""}${last ? ` The latest: ${clean(last.text)}, ${ago(last.at, now)}.` : ""}`;
    } },
    { id: "blocked", re: /block|stuck|problem|wrong|fail/, say: (d) => {
      const k = d.org.tasks?.blocked ?? 0, who = (d.org.roster?.agents ?? []).filter((a) => a.state === "blocked").map((a) => a.name);
      if (!k && !who.length) return "Nothing is blocked. Every task is moving.";
      return `${count(k, "task")} ${k === 1 ? "is" : "are"} blocked.${who.length ? ` ${list(who.slice(0, 3))} ${who.length === 1 ? "is" : "are"} waiting on a person.` : ""}`;
    } },
    { id: "spend", re: /spend|spent|cost|budget|money|how much|tokens?/, say: (d) => {
      const k = d.org.kpi ?? {}, top = (d.org.spendByModel ?? [])[0], s = d.org.spend ?? {};
      const budget = s.budgetCents ? ` This month we're at $${(s.monthCents / 100).toFixed(2)} of a $${(s.budgetCents / 100).toFixed(2)} budget.` : "";
      return `In the last 7 days the agents used ${tokens(k.tokens7d ?? 0)} tokens, costing $${Number(k.cost7d ?? 0).toFixed(2)}.${top ? ` ${model(top.model)} did ${top.share} percent of that.` : ""}${budget}`;
    } },
    { id: "recent", re: /what happened|latest|recent|lately|last hour|news|going on/, say: (d, now) => {
      const a = (d.org.audit ?? [])[0], w = (d.org.wire ?? [])[0];
      if (!a && !w) return "It's been quiet. Nothing new on the wire.";
      return [a && `Latest decision: ${clean(a.text)}, ${ago(a.at, now)}.`, w && `On the wire: ${clean(w.text)}, ${ago(w.at, now)}.`].filter(Boolean).join(" ");
    } },
    { id: "paused", re: /paused|sleeping|idle|asleep/, say: (d) => {
      const c = d.org.roster?.counts ?? {};
      return `${num(c.paused)} agents are paused and ${num(c.idle)} are idle, ready for work. Paused agents wake only when a person resumes them.`;
    } },
    { id: "org", re: /department|teams?|organi[sz]ation|structure|who works/, say: (d) => {
      const deps = depts(d).map((x) => x.name);
      return `${d.org.company} has ${count(deps.length, "department")}${deps.length ? ": " + list(deps) : ""}. ${num(d.org.agents?.active)} agents are active and ${num(d.org.agents?.paused)} are paused.`;
    } },
    { id: "status", re: /how many|agents?|status|how are (we|things)|overview|working|summary/, say: (d) => {
      const g = d.org.agents ?? {}, t = d.org.tasks ?? {}, k = d.org.kpi ?? {};
      return `${count(g.total, "agent")} in ${d.org.company}: ${num(g.active)} active, ${num(g.running)} running right now and ${num(g.paused)} paused. ${count(t.open, "task")} open, ${num(t.blocked)} blocked. ${k.success14 ?? 0} percent of runs succeeded over the last 14 days.`;
    } },
  ];

  // The line HIVE speaks for a question. Exported for the tests through window.HIVE_VOICE_ANSWER.
  function answer(question, data, now = Date.now()) {
    const q = String(question ?? "").toLowerCase();
    if (!data?.org) return "I can't reach the organization right now. Give me a moment.";
    const hit = INTENTS.find((i) => (i.match ? i.match(q, data) : i.re.test(q)));
    return hit ? hit.say(data, now, q) : `I heard "${clean(question)}". Ask me what I can do, or try what needs you, what's blocked, or what we spent.`;
  }
  window.HIVE_VOICE_ANSWER = answer;
  // The guided tour's questions, in order (T on the page plays them).
  const TOUR = (window.HIVE_VOICE_TOUR = ["Who are you?", "Are all systems up?", "What needs me today?", "How is HIVE governed?", "How much did we spend this week?", "Thank you HIVE"]);
  if (typeof document === "undefined") return;

  const V = (window.HIVE_VOICE = { level: 0, speaking: false, listening: false, ask, tour: () => tour() });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let micOk = !!SR, rec = null, hideTimer = 0, kickTo = 0;

  const css = document.createElement("style");
  css.textContent = `
    .hv-ask{position:fixed;left:50%;bottom:56px;transform:translateX(-50%);z-index:2147482999;pointer-events:none;
      font-family:Inter,ui-sans-serif,system-ui,sans-serif;width:min(640px,calc(100vw - 32px))}
    .hv-ask .cap{display:none;pointer-events:auto;width:100%;box-sizing:border-box;padding:14px 20px;border:1px solid rgba(255,255,255,.2);border-radius:12px;
      background:rgba(14,14,14,.92);backdrop-filter:blur(8px);box-shadow:0 18px 50px rgba(0,0,0,.55)}
    .hv-ask.show .cap{display:block}
    .hv-ask .who{font:600 11px/1 "JetBrains Mono",ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#9C9C9C;margin-bottom:6px}
    .hv-ask .q{font-size:17px;color:#BDBDBD;margin-bottom:12px}
    .hv-ask .a{font-size:21px;line-height:1.4;color:#FAFAFA}
    .hv-ask .a .who{color:#36E0AD}
    .hv-ask input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid rgba(255,255,255,.25);border-radius:8px;background:#0E0E0E;color:#FAFAFA;
      font:inherit;font-size:17px;outline:none}
    .hv-ask input:focus{border-color:#36E0AD}
    /* the tab sits on the right edge under the theme picker's tab: the one strip every theme leaves free */
    .hv-ask-tab{position:fixed;right:0;top:calc(50% + 78px);z-index:2147482999;writing-mode:vertical-rl;transform:rotate(180deg);display:flex;align-items:center;gap:8px;
      padding:14px 5px;cursor:pointer;border:1px solid rgba(255,255,255,.2);border-right:0;border-radius:0 8px 8px 0;background:rgba(14,14,14,.9);color:#BDBDBD;
      font:600 12px/1 "JetBrains Mono",ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase}
    .hv-ask-tab:hover{color:#FAFAFA;border-color:rgba(255,255,255,.4)}
    .hv-ask-tab:focus-visible{outline:2px solid #36E0AD;outline-offset:2px}
    .hv-ask-tab b{color:#FAFAFA;font-weight:600}
    .hv-ask-tab i{width:7px;height:7px;border-radius:50%;background:#6B6B6B}
    .hv-ask-tab.listening i{background:#36E0AD;box-shadow:0 0 10px #36E0AD;animation:hvblink 1s infinite}
    .hv-ask-tab.speaking i{background:#36E0AD;box-shadow:0 0 10px #36E0AD}
    @keyframes hvblink{50%{opacity:.3}}`;

  const box = document.createElement("div");
  box.className = "hv-ask";
  box.innerHTML = `<div class="cap" aria-live="polite"></div>`;
  const chip = document.createElement("button");
  chip.className = "hv-ask-tab"; chip.type = "button";
  chip.innerHTML = `<i></i><span></span>`;
  const cap = box.querySelector(".cap"), chipText = chip.querySelector("span");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const setChip = (html) => { chipText.innerHTML = html; };
  const idleChip = () => { setChip(micOk ? "Ask <b>HIVE</b> · hold space" : "Ask <b>HIVE</b> · space to type"); chip.title = (micOk ? "Hold Space and speak, or click to talk." : "Press Space or click to type a question.") + " Press T for the guided tour."; };
  const show = (html) => { clearTimeout(hideTimer); cap.innerHTML = html; box.classList.add("show"); };
  const hideSoon = (ms = 9000) => { clearTimeout(hideTimer); hideTimer = setTimeout(() => box.classList.remove("show"), ms); };
  const state = (s) => { chip.classList.toggle("listening", s === "listening"); chip.classList.toggle("speaking", s === "speaking"); V.listening = s === "listening"; };

  // The most natural voice installed: ?voice=<name> wins (to try voices by ear), then a Premium or Enhanced Daniel (System Settings →
  // Accessibility → Spoken Content), then any Premium or Enhanced British or English voice, then plain Daniel, then any British voice.
  let voice = null;
  const asked = new URLSearchParams(location.search).get("voice")?.toLowerCase();
  const pickVoice = () => {
    const vs = speechSynthesis.getVoices(), hq = (v) => /premium|enhanced/i.test(v.name + v.voiceURI);
    voice = (asked && vs.find((v) => v.name.toLowerCase().startsWith(asked)))
      ?? vs.find((v) => /^daniel/i.test(v.name) && hq(v)) ?? vs.find((v) => v.lang === "en-GB" && hq(v)) ?? vs.find((v) => v.lang?.startsWith("en") && hq(v))
      ?? vs.find((v) => v.name === "Daniel") ?? vs.find((v) => v.lang === "en-GB") ?? vs.find((v) => v.lang?.startsWith("en")) ?? null;
    V.voice = voice?.name ?? null;
  };
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.addEventListener?.("voiceschanged", pickVoice); }

  // Only the answer being spoken ends the pulse: cancelling an earlier one fires its error late, after the new one has started.
  let current = null;
  // Resolves when this answer has been spoken, or was cut off.
  function speak(text) {
    let finish;
    const spoken = new Promise((res) => { finish = res; });
    const turn = (current = {}), done = () => { finish(); if (current !== turn) return; V.speaking = false; state(""); hideSoon(); };
    V.speaking = true; state("speaking");
    if (!window.speechSynthesis) { setTimeout(done, text.split(" ").length * 330); return spoken; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-GB"; u.rate = 1.03;
    u.onboundary = () => { kickTo = 1; };   // each word gives the sphere a beat
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
    return spoken;
  }

  let spoken = Promise.resolve();
  async function ask(question, who = "YOU", still = () => true) {
    const q = String(question ?? "").replace(/\s+/g, " ").trim();
    if (!q) return;
    show(`<div class="who">${esc(who)}</div><div class="q">${esc(q)}</div><div class="a"><div class="who">HIVE</div>…</div>`);
    let data = null;
    try { data = await (await fetch("/data/hive.json", { cache: "no-store" })).json(); } catch { /* answered below */ }
    const line = answer(q, data);
    if (!still()) return line;   // a tour stopped while the data was loading
    show(`<div class="who">${esc(who)}</div><div class="q">${esc(q)}</div><div class="a"><div class="who">HIVE</div>${esc(line)}</div>`);
    spoken = speak(line);
    return line;
  }

  // The guided tour (T): HIVE asks itself the demo questions in order, typing each one out, answering aloud and pausing between them.
  // Any other key, a click on the tab, or Space to ask your own question stops it.
  let touring = 0;   // the running tour's id; 0 when none
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function tour() {
    const id = (touring = Date.now());
    const on = () => touring === id;
    for (let i = 0; i < TOUR.length && on(); i++) {
      const q = TOUR[i], who = `TOUR · ${i + 1} / ${TOUR.length}`;
      setChip(`Tour <b>${i + 1} / ${TOUR.length}</b> · any key stops`);
      for (let k = 1; k <= q.length && on(); k++) { show(`<div class="who">${who}</div><div class="q">${esc(q.slice(0, k))}▍</div>`); await wait(38); }
      if (!on()) break;
      await wait(350);
      await ask(q, who, on);
      await spoken;
      if (on()) await wait(1100);
    }
    if (on()) { touring = 0; idleChip(); }
  }
  function stopTour() {
    if (!touring) return false;
    touring = 0; current = null; V.speaking = false; state(""); idleChip();
    if (window.speechSynthesis) speechSynthesis.cancel();
    box.classList.remove("show");
    return true;
  }

  function typeBox() {
    show(`<div class="who">ASK HIVE</div><input type="text" placeholder="What needs me today?" aria-label="Ask HIVE">`);
    const input = cap.querySelector("input");
    input.focus();
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") ask(input.value);
      else if (e.key === "Escape") box.classList.remove("show");
    });
  }

  function listen() {
    if (!micOk) return typeBox();
    if (window.speechSynthesis) speechSynthesis.cancel();
    V.speaking = false; current = null;
    rec = new SR();
    rec.lang = "en-GB"; rec.interimResults = true; rec.maxAlternatives = 1;
    let heard = "";
    rec.onresult = (e) => {
      heard = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      show(`<div class="who">LISTENING</div><div class="q">${esc(heard)}</div>`);
    };
    rec.onerror = (e) => {
      // no microphone, no permission, or no speech service in this browser: fall back to typing for the rest of the session
      if (["not-allowed", "service-not-allowed", "network", "audio-capture"].includes(e.error)) { micOk = false; idleChip(); typeBox(); }
    };
    // a tap too short to hear anything gets a hint rather than silence
    rec.onend = () => { state(""); rec = null; if (heard) ask(heard); else if (micOk) { show(`<div class="who">HIVE</div><div class="q">I didn't catch that. Hold Space while you speak.</div>`); hideSoon(2500); } };
    state("listening");
    show(`<div class="who">LISTENING</div><div class="q">Go ahead…</div>`);
    try { rec.start(); } catch { micOk = false; idleChip(); typeBox(); }
  }

  const typing = (el) => el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
  addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    if (touring) { stopTour(); if (e.code !== "Space") { e.preventDefault(); return; } }
    else if (e.code === "KeyT" && !rec) { e.preventDefault(); tour(); return; }
    if (e.code !== "Space") return;
    e.preventDefault();
    if (!rec) listen();
  });
  addEventListener("keyup", (e) => { if (e.code === "Space" && rec) { e.preventDefault(); rec.stop(); } });
  chip.addEventListener("click", () => (stopTour() ? null : micOk && !rec ? listen() : rec ? rec.stop() : typeBox()));

  // The pulse: a slow breath while HIVE speaks, a beat on every word, a soft shimmer while it listens.
  let glowEl = null;
  const generic = () => {
    if (glowEl?.isConnected) return glowEl;
    let best = null, area = 0;
    for (const cv of document.querySelectorAll("canvas")) { const r = cv.getBoundingClientRect(), a = r.width * r.height; if (a > area) { area = a; best = cv; } }
    return (glowEl = best);
  };
  let shown = 0;
  function tick(ms) {
    const goal = V.speaking ? Math.max(kickTo, 0.5 + 0.2 * Math.sin(ms * 0.008)) : V.listening ? 0.22 + 0.1 * Math.sin(ms * 0.006) : 0;
    kickTo *= 0.9;
    V.level += (goal - V.level) * 0.14;
    if (V.level < 0.004) V.level = 0;
    if (!window.HIVE_VOICE_NATIVE) {
      const el = generic(), L = V.level;
      if (el && (L > 0 || shown)) {
        el.style.filter = L ? `drop-shadow(0 0 ${Math.round(40 * L)}px rgba(54,224,173,${(0.7 * L).toFixed(2)})) brightness(${(1 + 0.3 * L).toFixed(2)})` : "";
        el.style.transform = L ? `scale(${(1 + 0.02 * L).toFixed(4)})` : "";
        shown = L;
      }
    }
    requestAnimationFrame(tick);
  }

  const mount = () => { document.head.append(css); document.body.append(box, chip); idleChip(); requestAnimationFrame(tick); };
  document.body ? mount() : addEventListener("DOMContentLoaded", mount);
})();
