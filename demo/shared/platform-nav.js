// Shared left-sidebar block for the ATLAS pages (Ontology, Decisions, Twin, Back office).
// Mirrors Paperclip's sidebar groups and links into it, then the ATLAS sections from atlas-sections.json. Mount point: <div id="atlas-platform" data-current="ontology|decisions|twin|live|office"></div>
(function () {
  var I = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>"; };
  var ICON = {
    dashboard: I('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
    inbox: I('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>'),
    tasks: I('<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
    projects: I('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    routines: I('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
    artifacts: I('<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>'),
    agents: I('<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M8 14h.01M16 14h.01"/>'),
    skills: I('<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
    connectors: I('<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5"/>'),
    audit: I('<path d="M12 3 4 6v6c0 4.4 3.4 8 8 9 4.6-1 8-4.6 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
    langflow: I('<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 12h4a3 3 0 0 0 3-3V8.5M7.5 12h4a3 3 0 0 1 3 3v.5M14.5 6h2M14.5 18h2"/>'),
    builder: I('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>'),
    ontology: I('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5l3 8M16 7.5l-3 8M8.5 6h7"/>'),
    decisions: I('<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>'),
    apis: I('<path d="M8 6 3 12l5 6M16 6l5 6-5 6M14 4l-4 16"/>'),
    live: I('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
    twin: I('<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/>'),
    catalogue: I('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
    office: I('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    hive: I('<path d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9z"/><circle cx="12" cy="12" r="2.5"/>'),
    dot: I('<circle cx="12" cy="12" r="3"/>'),
    crm: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>')
  };
  var P = [];
  // ATLAS sections come from /shared/atlas-sections.json (one source with the Paperclip sidebar).
  var mount = document.getElementById("atlas-platform");
  if (!mount) return;
  var current = mount.getAttribute("data-current");
  var industry = new URLSearchParams(location.search).get("industry");
  if (current === "ontology" && industry) current = "ontology-" + industry;   // one Ontology page, one menu item per industry
  function link(icon, label, href, opts) {
    var a = document.createElement("a");
    a.className = "nav";
    a.innerHTML = ICON[icon] + "<span></span>";
    a.lastChild.textContent = label;
    if (href) { a.href = href; if (opts && opts.blank) { a.target = "_blank"; a.rel = "noopener"; } } else { a.setAttribute("aria-disabled", "true"); a.style.opacity = ".45"; a.title = "Not running"; }
    if (opts && opts.current) a.setAttribute("aria-current", "page");
    return a;
  }
  function label(text) { var d = document.createElement("div"); d.className = "sb-label"; d.textContent = text; return d; }
  function render(links, sections) {
    var frag = document.createDocumentFragment();
    P.forEach(function (g) {
      frag.append(label(g[0]));
      g[1].forEach(function (it) { frag.append(link(it[0], it[1], links.paperclip ? links.paperclip + it[2] : null)); });
    });
    sections.forEach(function (sec) {
      frag.append(label(sec.label));
      sec.items.forEach(function (it) {
        var ext = it.href === "$sim" || it.href === "$langflow";
        var href = it.href === "$sim" ? links.sim : it.href === "$langflow" ? links.langflow : it.href;
        frag.append(link(ICON[it.icon] ? it.icon : "dot", it.label, href, { current: it.key === current, blank: ext }));
      });
    });
    mount.replaceChildren(frag);
  }
  var links = { paperclip: null, sim: null, langflow: null }, sections = [];
  render(links, sections);
  fetch("/shared/atlas-sections.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { sections = j.sections || []; render(links, sections); }).catch(function () {});
  fetch("/data/platform.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { links = j; render(links, sections); }).catch(function () {});
})();
