// HIVE themes (P0-39): every HIVE design built so far, picked from one drop-down. Each theme is a whole page;
// the server picks it from ?theme= or the hive_theme cookie and inlines the shared picker at the top of <head>,
// so its data-call wrapper is in place before the page's own scripts run. Ask HIVE (P0-40, voice.js) rides along in the same tag.
import { readFileSync } from "node:fs";

export const THEMES = [
  { id: "sphere", label: "Sphere", file: "constellation.html" },
  { id: "constellation", label: "Constellation", file: "themes/constellation.html" },
  { id: "globe", label: "Globe", file: "index.html" },
  { id: "hud", label: "HUD", file: "themes/hud.html" },
  { id: "swarm", label: "Swarm", file: "themes/swarm.html" },
];
export const DEFAULT_THEME = THEMES[0].id;

// ?theme= wins (and is remembered by the picker); then the cookie; anything unknown falls back to the default.
export function pickTheme(search = "", cookie = "") {
  const known = (id) => THEMES.some((t) => t.id === id);
  const asked = new URLSearchParams(search).get("theme");
  if (known(asked)) return asked;
  const saved = /(?:^|;\s*)hive_theme=([a-z]+)/.exec(cookie ?? "")?.[1];
  return known(saved) ? saved : DEFAULT_THEME;
}

// The page for a theme, with the Explorer base filled in and the picker inlined. uiDir ends with a slash.
export function renderTheme(uiDir, id, explorer = "") {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  const picker = readFileSync(`${uiDir}theme-picker.js`, "utf8"), voice = readFileSync(`${uiDir}voice.js`, "utf8");
  const config = JSON.stringify({ current: theme.id, themes: THEMES.map(({ id, label }) => ({ id, label })) }).replaceAll("<", "\\u003c");
  const html = readFileSync(`${uiDir}${theme.file}`, "utf8").replaceAll("__EXPLORER__", explorer);
  const tag = `<script>window.HIVE_THEMES = ${config};\n${picker}\n${voice}</script>\n`;
  return /<head>/i.test(html) ? html.replace(/<head>/i, (h) => `${h}\n${tag}`) : tag + html;
}
