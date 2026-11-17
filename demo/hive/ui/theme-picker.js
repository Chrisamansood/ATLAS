// HIVE theme picker (P0-39), inlined into every theme by hive/lib/themes.mjs with window.HIVE_THEMES set.
// Loaded at the top of <head>; the drop-down mounts once the body exists. Picking a theme stores it in the hive_theme cookie (the server reads it) and reloads /hive without ?theme.
(() => {
  const cfg = window.HIVE_THEMES;
  if (!cfg) return;

  // An org pinned on the Sphere theme (localStorage hive.org) holds on every theme: add ?company= to the data call.
  let pinned = null;
  try { pinned = new URLSearchParams(location.search).get("org") || localStorage.getItem("hive.org"); } catch { /* storage blocked */ }
  if (pinned) {
    const fetch0 = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (typeof input === "string" && input.startsWith("/data/hive.json") && !input.includes("company=")) input += (input.includes("?") ? "&" : "?") + "company=" + encodeURIComponent(pinned);
      return fetch0(input, init);
    };
  }

  const remember = (id) => { document.cookie = `hive_theme=${id}; path=/; max-age=31536000; samesite=lax`; };
  // Opened with ?theme=: keep it for next time.
  if (new URLSearchParams(location.search).has("theme")) remember(cfg.current);

  // A slim tab on the right edge: the one strip every theme leaves free. It opens a short menu of themes.
  const css = document.createElement("style");
  css.textContent = `
    .hv-theme{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483000;font:600 12px/1 "JetBrains Mono",ui-monospace,Menlo,monospace}
    .hv-theme>button{writing-mode:vertical-rl;transform:rotate(180deg);display:flex;align-items:center;gap:8px;padding:14px 5px;cursor:pointer;
      border:1px solid rgba(255,255,255,.2);border-right:0;border-radius:0 8px 8px 0;background:rgba(14,14,14,.9);color:#BDBDBD;
      font:inherit;letter-spacing:.16em;text-transform:uppercase}
    .hv-theme>button b{color:#FAFAFA;font-weight:600}
    .hv-theme>button:hover,.hv-theme.open>button{color:#FAFAFA;border-color:rgba(255,255,255,.4)}
    .hv-theme>button:focus-visible,.hv-theme [role=menuitemradio]:focus-visible{outline:2px solid #36E0AD;outline-offset:2px}
    .hv-theme [role=menu]{position:absolute;right:calc(100% + 8px);top:50%;transform:translateY(-50%);display:none;min-width:190px;padding:6px;
      border:1px solid rgba(255,255,255,.2);border-radius:10px;background:rgba(14,14,14,.96);box-shadow:0 12px 40px rgba(0,0,0,.5)}
    .hv-theme.open [role=menu]{display:block}
    .hv-theme .hd{padding:8px 10px 6px;color:#9C9C9C;letter-spacing:.16em;font-size:11px}
    .hv-theme [role=menuitemradio]{display:flex;justify-content:space-between;width:100%;padding:10px;border:0;border-radius:6px;cursor:pointer;
      background:none;color:#E5E5E5;font:inherit;font-size:14px;letter-spacing:.04em;text-align:left}
    .hv-theme [role=menuitemradio]:hover{background:#262626}
    .hv-theme [aria-checked=true]{color:#36E0AD}
    .hv-theme [aria-checked=true]::after{content:"●"}`;
  const mount = () => {
    document.head.appendChild(css);
    const current = cfg.themes.find((t) => t.id === cfg.current) ?? cfg.themes[0];
    const box = document.createElement("div");
    box.className = "hv-theme";
    box.innerHTML = `<button type="button" aria-haspopup="menu" aria-expanded="false" title="Change the HIVE theme">Theme <b>${current.label}</b></button>`
      + `<div role="menu" aria-label="HIVE theme"><div class="hd">THEME</div>${cfg.themes.map((t) => `<button type="button" role="menuitemradio" aria-checked="${t.id === current.id}" data-id="${t.id}">${t.label}</button>`).join("")}</div>`;
    const tab = box.firstElementChild, items = [...box.querySelectorAll("[role=menuitemradio]")];
    const open = (on) => { box.classList.toggle("open", on); tab.setAttribute("aria-expanded", String(on)); if (on) items.find((i) => i.dataset.id === current.id)?.focus(); };
    tab.addEventListener("click", () => open(!box.classList.contains("open")));
    // Number keys jump between pages on every theme; keep keys pressed in the menu to the menu.
    box.addEventListener("keydown", (e) => {
      e.stopPropagation();
      const i = items.indexOf(document.activeElement);
      if (e.key === "Escape") { open(false); tab.focus(); }
      else if (i >= 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus(); }
    });
    document.addEventListener("click", (e) => { if (!box.contains(e.target)) open(false); });
    items.forEach((i) => i.addEventListener("click", () => {
      if (i.dataset.id === current.id) { open(false); return; }
      remember(i.dataset.id);
      const u = new URL(location.href);
      u.searchParams.delete("theme");
      location.href = u.pathname + u.search + u.hash;
    }));
    document.body.appendChild(box);
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount) : mount();
})();
