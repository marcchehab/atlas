// Server-rendered HTML als Template-Strings — bewusst ohne Template-Engine.
// Look angelehnt an Eduskript: Inter (UI), Barlow Condensed (Headings), #f5f5f5, Primärblau.

import fsSync from 'node:fs'
import pathMod from 'node:path'

// Logo inline statt <img>: so folgt es dem manuellen Theme-Toggle (data-theme) statt nur
// dem System-Schema. Der <style>-Block der Datei (prefers-color-scheme, fürs README) fliegt
// raus — die Seite stylt die Klassen selbst über ihre Theme-Variablen.
const LOGO_INLINE = fsSync
  .readFileSync(pathMod.join(process.cwd(), 'public', 'logo.svg'), 'utf8')
  .replace(/<style>[\s\S]*?<\/style>/, '')

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function kürze(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

export const BASE_URL = process.env.BASE_URL ?? 'https://atlas.eduskript.org'

// SEO-Slugs: Keywords in die URL (/fach/…/k/1.2.1-begriff-algorithmus-definieren).
// Stoppwörter raus, damit die tragenden Begriffe vorne stehen; max 5 Wörter.
const STOPP = new Set('der die das den dem des ein eine einer eines einem und oder mit für von im in zu sie sich auf aus bei als z b zb ihre seine indem mittels können'.split(' '))
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOPP.has(w))
    .slice(0, 5)
    .join('-')
}
export const tgPfad = (fach: string, code: string, name: string) => `/fach/${fach}/t/${code}-${slug(name)}`
export const koPfad = (fach: string, code: string, text: string) => `/fach/${fach}/k/${code}-${slug(text)}`
export const grossErst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export interface SeoDaten {
  beschreibung?: string
  pfad?: string // kanonischer Pfad → canonical + og:url
  robots?: string // z.B. "noindex,follow" für Suchseiten
  vollTitel?: boolean // Titel ohne "– Atlas"-Suffix (Homepage)
  jsonLd?: object
}

export function layout(titel: string, sidebar: string, body: string, user?: { nickname: string } | null, seo?: SeoDaten): string {
  const vollerTitel = seo?.vollTitel ? titel : `${titel} – Atlas`
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(vollerTitel)}</title>
${seo?.beschreibung ? `<meta name="description" content="${esc(seo.beschreibung)}">` : ''}
${seo?.robots ? `<meta name="robots" content="${esc(seo.robots)}">` : ''}
${seo?.pfad != null ? `<link rel="canonical" href="${esc(BASE_URL + seo.pfad)}">
<meta property="og:url" content="${esc(BASE_URL + seo.pfad)}">` : ''}
<meta property="og:title" content="${esc(vollerTitel)}">
${seo?.beschreibung ? `<meta property="og:description" content="${esc(seo.beschreibung)}">` : ''}
<meta property="og:site_name" content="Atlas">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_CH">
${seo?.jsonLd ? `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script src="/htmx.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script>
  // Vor dem ersten Paint: Theme und Schriftgrösse aus localStorage
  (function () {
    const t = localStorage.getItem('theme')
    if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.dataset.theme = 'dark'
    const f = localStorage.getItem('fontsize')
    if (f) document.documentElement.style.fontSize = f + '%'
    const b = localStorage.getItem('sidebarBreite')
    if (b) document.documentElement.style.setProperty('--sb-breite', b + 'px')
  })()
  function themeWechseln() {
    const dunkel = document.documentElement.dataset.theme === 'dark'
    if (dunkel) delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = 'dark'
    localStorage.setItem('theme', dunkel ? 'light' : 'dark')
  }
  function schrift(delta) {
    const f = Math.min(130, Math.max(80, (parseInt(localStorage.getItem('fontsize')) || 100) + delta))
    localStorage.setItem('fontsize', f)
    document.documentElement.style.fontSize = f + '%'
  }
  // Filter (Quellen/Tags/Format): persistiert in localStorage, wirkt clientseitig auf die Karten.
  // Kopfzeile = Tabs; die Chip-Zeile darunter zeigt die gewählte Kategorie.
  function fltr(k) { try { return JSON.parse(localStorage.getItem('f-' + k)) || [] } catch { return [] } }
  function fltrSet(k, a) { localStorage.setItem('f-' + k, JSON.stringify(a)); wendeFilterAn() }
  function fltrToggle(k, v) { const a = fltr(k); fltrSet(k, a.includes(v) ? a.filter((x) => x !== v) : [...a, v]) }
  function quelleWaehlen(v) { const a = fltr('quellen'); fltrSet('quellen', a.length === 1 && a[0] === v ? [] : [v]) }
  function fkatWaehlen(k) {
    localStorage.setItem('filterTab', localStorage.getItem('filterTab') === k ? '' : k)
    zeigeFilterTab()
  }
  function zeigeFilterTab() {
    const k = localStorage.getItem('filterTab') ?? 'quellen' // Default: Quellen offen
    document.querySelectorAll('.fchips').forEach((el) => { el.style.display = el.dataset.k === k ? 'flex' : 'none' })
    document.querySelectorAll('.fkat').forEach((el) => el.classList.toggle('offen', el.dataset.k === k))
  }
  function wendeFilterAn() {
    const f = { quellen: fltr('quellen'), tags: fltr('tags'), format: fltr('format') }
    const karten = [...document.querySelectorAll('.karte[data-quelle]')].map((el) => ({
      el,
      quellen: el.dataset.quelle,
      tags: (el.dataset.tags || '').split(' ').filter(Boolean),
      format: el.dataset.format || '',
    }))
    const passt = (k, kat) =>
      kat === 'quellen' ? (!f.quellen.length || f.quellen.includes(k.quellen))
      : kat === 'tags' ? (!f.tags.length || k.tags.some((x) => f.tags.includes(x)))
      : (!f.format.length || f.format.includes(k.format))
    karten.forEach((k) => { k.el.style.display = passt(k, 'quellen') && passt(k, 'tags') && passt(k, 'format') ? '' : 'none' })
    // Chip-Zahlen: wie viele Karten dieser Chip (unter den Filtern der anderen Kategorien) zeigen würde
    document.querySelectorAll('.qchip[data-fk]').forEach((c) => {
      const kat = c.dataset.fk, v = c.dataset.q
      const hat = (k) => (kat === 'quellen' ? k.quellen === v : kat === 'tags' ? k.tags.includes(v) : k.format === v)
      const andere = ['quellen', 'tags', 'format'].filter((x) => x !== kat)
      const n = karten.filter((k) => hat(k) && andere.every((x) => passt(k, x))).length
      const z = c.querySelector('.chipzahl')
      if (z) z.textContent = n
      c.classList.toggle('aktiv', f[kat].includes(v))
    })
    document.querySelectorAll('.fkat').forEach((el) => el.classList.toggle('mit-punkt', fltr(el.dataset.k).length > 0))
  }
  function filterReset() { for (const k of ['quellen', 'tags', 'format']) localStorage.setItem('f-' + k, '[]'); wendeFilterAn() }
  document.addEventListener('DOMContentLoaded', () => { zeigeFilterTab(); wendeFilterAn() })
  function nicknameAendern(aktuell) {
    const d = document.getElementById('nick-dialog')
    d.querySelector('input').value = aktuell
    d.querySelector('.fehler').textContent = ''
    d.showModal()
  }
  function nicknameSpeichern(ev) {
    ev.preventDefault()
    const d = document.getElementById('nick-dialog')
    const neu = d.querySelector('input').value.trim()
    fetch('/profil/nickname', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'nickname=' + encodeURIComponent(neu),
    }).then((r) => {
      if (r.ok) location.reload()
      else r.text().then((t) => { d.querySelector('.fehler').textContent = t || 'Fehler' })
    })
  }
</script>
<style>
  :root { --primary: hsl(221.2 83.2% 53.3%); --bg: #f5f5f5; --card: #fff; --fg: #262626; --rand: #e4e4e4; --meta: #737373; --chip: #eef3fa; --chip-ziel: #f3eefa; --hinweis-bg: #fff8e1; --hinweis-rand: #e6d9a0; }
  [data-theme="dark"] { --primary: hsl(217.2 91.2% 59.8%); --bg: #0d0d0d; --card: #1a1a1a; --fg: #e5e5e5; --rand: #2e2e2e; --meta: #9ca3af; --chip: #1c2740; --chip-ziel: #29203f; --hinweis-bg: #2b2413; --hinweis-rand: #5c4d1e; }
  * { box-sizing: border-box; }
  body { font-family: Inter, system-ui, sans-serif; margin: 0; background: var(--bg); color: var(--fg); line-height: 1.5; }
  h1, h2, h3 { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: .01em; }
  a { color: var(--primary); text-decoration: none; } a:hover { text-decoration: underline; }
  .logo-svg svg { width: 100%; height: auto; display: block; }
  .logo-svg .mark-bg { fill: var(--bg); } .logo-svg .mark { stroke: var(--meta); }
  .logo-svg .wort { fill: var(--fg); } .logo-svg .sub { fill: var(--meta); }
  .logo-svg .sub-brand { fill: color-mix(in oklab, var(--primary) 55%, var(--meta)); }
  .logo-svg .sub-link:hover .sub-brand { fill: var(--primary); }
  .logo-svg .sub-org { font: 700 29.3px 'Barlow Condensed', sans-serif; }
  .logo-svg a:hover { text-decoration: none; }
  .logo-svg .sub-strich { fill: none; }
  .logo-svg .sub-link:hover .sub-strich { fill: var(--primary); }

  .app { display: flex; min-height: 100vh; }
  .sb-griff { width: 5px; flex-shrink: 0; cursor: col-resize; background: transparent; margin-left: -3px; z-index: 30; }
  .sb-griff:hover, .sb-griff.aktiv { background: var(--primary); opacity: .5; }
  aside { width: var(--sb-breite, 300px); flex-shrink: 0; background: var(--card); border-right: 1px solid var(--rand); padding: 1rem; overflow-y: auto; position: sticky; top: 0; height: 100vh; }
  main { flex: 1; padding: 1.5rem 2rem; max-width: 56rem; }

  .pillbar { display: flex; justify-content: center; gap: .5rem; margin: .6rem 0 1rem; }
  .pillbar .pill { display: flex; align-items: center; border: 1px solid var(--rand); background: var(--card); border-radius: 8px; overflow: hidden; }
  .pillbar button, .pillbar .pbtn { border: none; background: none; color: var(--fg); font: inherit; font-size: .82rem; padding: .35rem .55rem; cursor: pointer; display: flex; align-items: center; gap: .3rem; text-decoration: none; }
  .seiten-controls { position: fixed; top: .8rem; right: 1rem; z-index: 50; display: flex; align-items: center; border: 1px solid var(--rand); background: var(--card); border-radius: 999px; overflow: hidden; box-shadow: 0 1px 3px rgb(0 0 0 / .08); }
  .seiten-controls button { border: none; background: none; color: var(--fg); font: inherit; font-size: .7rem; padding: .25rem .5rem; cursor: pointer; display: flex; align-items: center; }
  .seiten-controls button:hover { background: var(--bg); }
  .seiten-controls .sep { width: 1px; align-self: stretch; background: var(--rand); }
  .seiten-controls svg { width: 12px; height: 12px; }
  .pillbar button:hover, .pillbar a.pbtn:hover { background: var(--bg); }
  .pillbar .sep { width: 1px; background: var(--rand); }
  .pillbar .melden-pill { background: var(--primary); border-color: var(--primary); }
  .pillbar .melden-pill a.pbtn { color: #fff; font-weight: 500; }
  .pillbar .melden-pill a.pbtn:hover { background: rgb(255 255 255 / .15); }
  dialog { border: 1px solid var(--rand); border-radius: 12px; background: var(--card); color: var(--fg); padding: 1.2rem 1.4rem; min-width: 18rem; box-shadow: 0 8px 30px rgb(0 0 0 / .2); }
  dialog::backdrop { background: rgb(0 0 0 / .35); }
  dialog input { width: 100%; padding: .5rem .7rem; border: 1px solid var(--rand); border-radius: 8px; background: var(--card); color: var(--fg); font: inherit; }
  dialog .sekundaer { background: var(--bg); color: var(--fg); border: 1px solid var(--rand); }
  .nur-dunkel { display: none; } [data-theme="dark"] .nur-dunkel { display: flex; } [data-theme="dark"] .nur-hell { display: none; }
  .nur-hell { display: flex; }
  .btn-loeschen { background: none !important; border: none; color: #b3261e; opacity: .55; padding: .2rem .3rem; cursor: pointer; border-radius: 6px; display: inline-flex; }
  .btn-loeschen:hover { opacity: 1; background: rgb(179 38 30 / .1) !important; }
  .qfilter { margin-bottom: 1rem; }
  .fkats { display: flex; gap: 1rem; margin-bottom: .4rem; }
  .fkat { border: none; background: none; color: var(--meta); font: inherit; font-size: .85rem; cursor: pointer; display: flex; align-items: center; gap: .25rem; padding: 0; position: relative; }
  .fkat:hover { color: var(--fg); }
  .fkat.offen { color: var(--fg); font-weight: 600; }
  .fkat svg { transition: transform .15s; }
  .fkat.offen svg { transform: rotate(90deg); }
  .tag-edit { border: 1px solid transparent; background: transparent; color: var(--fg); font: inherit; font-size: .88rem; padding: .1rem .3rem; border-radius: 6px; width: 11rem; }
  .tag-edit:hover, .tag-edit:focus { border-color: var(--rand); background: var(--card); outline: none; }
  .chipzahl { font-size: .68rem; opacity: .6; margin-left: .3rem; }
  .qchip.aktiv .chipzahl { opacity: .85; }
  .freset { font-size: .72rem; opacity: .6; margin-left: .3rem; }
  .freset:hover { opacity: 1; }
  .fkat .punkt { display: none; width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
  .fkat.mit-punkt .punkt { display: inline-block; }
  .fchips { display: none; align-items: center; gap: .4rem; flex-wrap: wrap; }
  .qchip { border: 1px solid var(--rand); background: var(--card); color: var(--fg); border-radius: 999px; padding: .1rem .7rem; font-size: .78rem; cursor: pointer; }
  .qchip:hover { background: var(--bg); }
  .qchip.aktiv { background: var(--primary); color: #fff; border-color: var(--primary); }
  .qchip.vorschlag { border-style: dashed; color: var(--meta); text-decoration: none; }
  .qchip.vorschlag.aktiv { background: var(--primary); color: #fff; border-color: var(--primary); border-style: solid; }
  .karte .quelle-link { color: var(--meta); } .karte .quelle-link:hover { color: var(--fg); text-decoration: none; }

  aside .logo { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 1.5rem; color: var(--primary); }
  aside .by { font-family: Inter, sans-serif; font-size: 11px; color: rgb(115 115 115 / .4); margin-left: .3rem; }
  aside .by:hover { color: var(--meta); text-decoration: none; }
  aside .untertitel { font-size: .75rem; color: var(--meta); margin-bottom: 1rem; }
  aside select { width: 100%; padding: .4rem; font: inherit; border: 1px solid var(--rand); border-radius: 6px; background: var(--card); color: var(--fg); margin-bottom: 1rem; }
  .lg { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: .95rem; margin: .9rem 0 .2rem; }
  .tg, .ko { display: block; border-radius: 6px; padding: .15rem .5rem; color: var(--fg); font-size: .85rem; }
  .tg { font-weight: 600; margin-top: .15rem; }
  .ko { padding-left: 1.4rem; color: var(--meta); font-size: .8rem; }
  .tg:hover, .ko:hover { background: var(--bg); text-decoration: none; }
  .tg.aktiv, .ko.aktiv { background: var(--primary); color: #fff; }
  .anzahl { color: var(--meta); font-weight: 400; font-size: .75rem; }
  .tg.aktiv .anzahl, .ko.aktiv .anzahl { color: #cdd9f7; }
  aside .fuss { margin-top: 1.2rem; padding-top: .8rem; border-top: 1px solid var(--rand); font-size: .8rem; display: flex; flex-direction: column; gap: .3rem; }

  .karte { background: var(--card); border: 1px solid var(--rand); border-radius: 10px; padding: .9rem 1.1rem; margin-bottom: .8rem; }
  .karte h3 { margin: 0 0 .3rem; font-size: 1.15rem; }
  .meta { font-size: .8rem; color: var(--meta); }
  .tag { display: inline-block; background: var(--chip); border-radius: 999px; padding: .05rem .6rem; font-size: .78rem; margin-right: .3rem; color: var(--primary); }
  .tag.ziel { background: var(--chip-ziel); }
  .tag.format { background: transparent; border: 1px solid var(--rand); color: var(--meta); }
  .voten { display: flex; flex-direction: column; align-items: center; gap: .1rem; }
  .voten .pfeil { border: 1px solid var(--rand); border-radius: 8px; background: var(--card); color: var(--fg); cursor: pointer; padding: .1rem .55rem; font-size: .85rem; line-height: 1.3; font-family: inherit; }
  .voten .pfeil:hover { background: var(--bg); text-decoration: none; }
  .voten .pfeil.aktiv { background: var(--primary); color: #fff; border-color: var(--primary); }
  .voten .score { font-weight: 600; font-size: .95rem; }
  form.suche { display: flex; gap: .5rem; margin-bottom: 1.2rem; }
  form.suche input[type=search] { flex: 1; padding: .5rem .7rem; border: 1px solid var(--rand); border-radius: 8px; font: inherit; background: var(--card); color: var(--fg); }
  input, select, button { font: inherit; }
  button { background: var(--primary); color: #fff; border: none; border-radius: 8px; padding: .5rem 1rem; cursor: pointer; }
  input[type=url], input[type=email], input[type=text], input:not([type]), select { padding: .5rem .7rem; border: 1px solid var(--rand); border-radius: 8px; background: var(--card); color: var(--fg); }
  .hinweis { background: var(--hinweis-bg); border: 1px solid var(--hinweis-rand); border-radius: 8px; padding: .5rem .8rem; font-size: .85rem; }
  table { border-collapse: collapse; width: 100%; background: var(--card); border-radius: 10px; }
  td, th { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid var(--rand); font-size: .88rem; }
</style>
</head>
<body>
<dialog id="nick-dialog">
  <form onsubmit="nicknameSpeichern(event)">
    <h3 style="margin:0 0 .6rem">Nickname ändern</h3>
    <input name="nickname" required minlength="2" maxlength="30" autocomplete="off">
    <div class="fehler meta" style="color:#b3261e;min-height:1.2em;margin:.3rem 0"></div>
    <div style="display:flex;gap:.5rem;justify-content:flex-end">
      <button type="button" class="sekundaer" onclick="this.closest('dialog').close()">Abbrechen</button>
      <button type="submit">Speichern</button>
    </div>
  </form>
</dialog>
<div class="seiten-controls">
  <button onclick="schrift(-10)" title="Schrift verkleinern">A−</button><div class="sep"></div><button onclick="themeWechseln()" title="Hell/Dunkel"><span class="nur-hell"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg></span><span class="nur-dunkel"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg></span></button><div class="sep"></div><button onclick="schrift(10)" title="Schrift vergrössern">A+</button>
</div>
<div class="app">
<aside>${sidebar}</aside>
<div class="sb-griff" title="Sidebar-Breite ziehen"></div>
<main>${body}</main>
</div>
<script>
  // Sidebar entlang der Grenze ziehbar; Breite persistiert
  (function () {
    const griff = document.querySelector('.sb-griff')
    if (!griff) return
    griff.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      griff.classList.add('aktiv')
      griff.setPointerCapture(e.pointerId)
      const move = (ev) => {
        const b = Math.min(480, Math.max(220, ev.clientX))
        document.documentElement.style.setProperty('--sb-breite', b + 'px')
        localStorage.setItem('sidebarBreite', b)
      }
      const up = () => {
        griff.classList.remove('aktiv')
        griff.removeEventListener('pointermove', move)
        griff.removeEventListener('pointerup', up)
      }
      griff.addEventListener('pointermove', move)
      griff.addEventListener('pointerup', up)
    })
  })()
</script>
</body></html>`
}

export interface SidebarDaten {
  faecher: { code: string; name: string }[]
  fachCode: string
  lehrplanUrl: string | null
  lerngebiete: {
    nummer: number
    name: string
    teilgebiete: {
      code: string
      name: string
      anzahl: number
      kompetenzen: { code: string; text: string; anzahl: number }[]
    }[]
  }[]
  aktiv?: string // "T1.2" | "K1.2.1"
  user?: { nickname: string; istAdmin?: boolean } | null
}

export function sidebar(d: SidebarDaten): string {
  const basis = `/fach/${d.fachCode}`
  const moon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`
  const sun = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`
  const person = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
  const login = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`
  const stift = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>`
  const logout = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
  const plus = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`
  return `<div class="logo-svg" style="width:170px;margin:0 auto .3rem">${LOGO_INLINE.replace('href="/"', `href="${basis}"`)}</div>
<div class="untertitel" style="text-align:center">Unterrichtsmaterialien Schweizer Gymnasien</div>
<div class="pillbar">
  <div class="pill melden-pill"><a class="pbtn" href="/melden?fach=${esc(d.fachCode)}" title="Nur ein Link — den Rest macht Atlas">+ Quelle melden</a></div>
  ${
    d.user
      ? `<div class="pill">
<span class="pbtn" style="cursor:default" title="${esc(d.user.nickname)}">${person}${esc(kürze(d.user.nickname.split(' ')[0], 7))}</span><div class="sep"></div><button style="padding:.35rem .4rem" onclick="nicknameAendern('${esc(d.user.nickname)}')" title="Nickname ändern">${stift}</button><div class="sep"></div><button style="padding:.35rem .4rem" onclick="document.getElementById('lo').submit()" title="Abmelden">${logout}</button><form id="lo" method="post" action="/logout" hidden></form>
</div>`
      : `<div class="pill"><a class="pbtn" href="/login" title="Sign in">${login}</a></div>`
  }
</div>
<select onchange="location='/fach/'+this.value">
${d.faecher.map((f) => `<option value="${esc(f.code)}"${f.code === d.fachCode ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}
</select>
${d.lerngebiete
  .map(
    (lg) => `<div class="lg">${lg.nummer}. ${esc(lg.name)}</div>
${lg.teilgebiete
  .map(
    (tg) => `<a class="tg${d.aktiv === 'T' + tg.code ? ' aktiv' : ''}" href="${tgPfad(d.fachCode, tg.code, tg.name)}">${tg.code} ${esc(tg.name)} <span class="anzahl">${tg.anzahl || ''}</span></a>
${tg.kompetenzen
  .map((ko) => `<a class="ko${d.aktiv === 'K' + ko.code ? ' aktiv' : ''}" href="${koPfad(d.fachCode, ko.code, ko.text)}" title="${esc(ko.text)}">${esc(kürze(ko.text, 48))} <span class="anzahl">${ko.anzahl || ''}</span></a>`)
  .join('\n')}`
  )
  .join('\n')}`
  )
  .join('\n')}
<div class="fuss">
  ${d.lehrplanUrl ? `<a href="${esc(d.lehrplanUrl)}" rel="noopener">Lehrplan (Original-PDF)</a>` : ''}
  <a href="https://eduskript.org" target="_blank" rel="noopener">eduskript.org</a>
  <a href="/suche">Suche</a>
  <a href="/melden">Quelle melden</a>
  <a href="/quellen">Quellen</a>
  ${d.user?.istAdmin ? '<a href="/admin">Admin</a>' : ''}
</div>`
}

// Eigenständige zentrierte Login-Seite im Eduskript-Stil (Card, Microsoft-Button, Divider, E-Mail).
export function loginSeite(opts: { microsoft: boolean; weiter: string; hinweis?: string }): string {
  const msIcon = `<svg style="width:20px;height:20px;margin-right:.5rem" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10.87v10.87H0z" fill="#f25022"/><path d="M12.13 0H23v10.87H12.13z" fill="#7fba00"/><path d="M0 12.13h10.87V23H0z" fill="#00a4ef"/><path d="M12.13 12.13H23V23H12.13z" fill="#ffb900"/></svg>`
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Anmelden – Atlas</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --primary: hsl(221.2 83.2% 53.3%); --bg: #f5f5f5; --fg: #262626; --rand: #e4e4e4; --meta: #737373; }
  * { box-sizing: border-box; }
  body { font-family: Inter, system-ui, sans-serif; margin: 0; background: var(--bg); color: var(--fg); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
  .card { background: #fff; border: 1px solid var(--rand); border-radius: 12px; padding: 2rem; width: 100%; max-width: 26rem; box-shadow: 0 1px 3px rgb(0 0 0 / .06); }
  .kopf { display: flex; align-items: center; justify-content: center; margin-bottom: 1.2rem; }
  .logo-svg svg { width: 100%; height: auto; display: block; }
  .logo-svg .mark-bg { fill: var(--bg); } .logo-svg .mark { stroke: var(--meta); }
  .logo-svg .wort { fill: var(--fg); } .logo-svg .sub { fill: var(--meta); }
  .logo-svg .sub-brand { fill: color-mix(in oklab, var(--primary) 55%, var(--meta)); }
  .logo-svg .sub-link:hover .sub-brand { fill: var(--primary); }
  .logo-svg .sub-org { font: 700 29.3px 'Barlow Condensed', sans-serif; }
  .logo-svg a:hover { text-decoration: none; }
  .logo-svg .sub-strich { fill: none; }
  .logo-svg .sub-link:hover .sub-strich { fill: var(--primary); }
  h1 { font-family: 'Barlow Condensed', sans-serif; font-size: 1.6rem; text-align: center; margin: 0 0 .3rem; }
  .sub { text-align: center; color: var(--meta); font-size: .9rem; margin: 0 0 1.5rem; }
  .btn { display: flex; align-items: center; justify-content: center; width: 100%; padding: .6rem 1rem; border-radius: 8px; font: inherit; font-weight: 500; cursor: pointer; text-decoration: none; }
  .btn.ms { background: #fff; color: var(--fg); border: 1px solid var(--rand); }
  .btn.ms:hover { background: var(--bg); }
  .btn.primaer { background: var(--primary); color: #fff; border: none; margin-top: .6rem; }
  .divider { display: flex; align-items: center; gap: .8rem; margin: 1.4rem 0; color: var(--meta); font-size: .75rem; text-transform: uppercase; }
  .divider::before, .divider::after { content: ''; flex: 1; border-top: 1px solid var(--rand); }
  input[type=email] { width: 100%; padding: .6rem .8rem; border: 1px solid var(--rand); border-radius: 8px; font: inherit; }
  .hinweis { background: #eef7ee; border: 1px solid #bfe3bf; border-radius: 8px; padding: .5rem .8rem; font-size: .85rem; margin-bottom: 1rem; }
  .fuss { text-align: center; margin-top: 1.4rem; font-size: .8rem; } .fuss a { color: var(--meta); text-decoration: none; } .fuss a:hover { color: var(--fg); }
</style>
</head>
<body>
<div class="card">
  <div class="kopf"><div class="logo-svg" style="width:160px">${LOGO_INLINE}</div></div>
  <h1>Anmelden</h1>
  <p class="sub">Zum Melden und Bewerten von Materialien</p>
  ${opts.hinweis ? `<div class="hinweis">${esc(opts.hinweis)}</div>` : ''}
  ${opts.microsoft ? `<a class="btn ms" href="/auth/microsoft?weiter=${esc(opts.weiter)}">${msIcon}Mit Microsoft anmelden</a>
  <div class="divider">oder per E-Mail</div>` : ''}
  <form method="post" action="/auth/magic">
    <input type="hidden" name="weiter" value="${esc(opts.weiter)}">
    <input type="email" name="email" required placeholder="E-Mail-Adresse">
    <button class="btn primaer">Anmelde-Link senden</button>
  </form>
  <div class="fuss"><a href="/">← Zurück zu Atlas</a></div>
</div>
</body></html>`
}

export interface MaterialKarte {
  id: number
  titel: string
  url: string
  zusammenfassung: string
  tags: string[]
  format: string | null
  zuordnungen: { code: string; label: string; href: string }[]
  score: number
  meinVote: number // +1 | 0 | -1
}

// Stack-Overflow-Stil: ▲ / Score / ▼ vertikal, getrennte Buttons.
export function voteButtons(m: { id: number; score: number; meinVote: number }, eingeloggt: boolean): string {
  if (!eingeloggt)
    return `<div class="voten"><a class="pfeil" href="/login" title="Zum Voten anmelden">▲</a><span class="score">${m.score}</span><a class="pfeil" href="/login" title="Zum Voten anmelden">▼</a></div>`
  return `<div class="voten">
  <button class="pfeil${m.meinVote > 0 ? ' aktiv' : ''}" hx-post="/vote/${m.id}/up" hx-target="closest .voten" hx-swap="outerHTML" title="Upvote">▲</button>
  <span class="score">${m.score}</span>
  <button class="pfeil${m.meinVote < 0 ? ' aktiv' : ''}" hx-post="/vote/${m.id}/down" hx-target="closest .voten" hx-swap="outerHTML" title="Downvote">▼</button>
</div>`
}

// Gruppen-Schlüssel einer URL: "github.com/user" bzw. Hostname
export function quellenKey(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (['github.com', 'gitlab.com', 'codeberg.org', 'eduskript.org'].includes(host)) return `${host}/${u.pathname.split('/').filter(Boolean)[0] ?? ''}`
    return host
  } catch {
    return url
  }
}

// Quelle als Kurz-Label: github.com/**user**, sonst **hostname**
export function quellenLabel(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (['github.com', 'gitlab.com', 'codeberg.org', 'eduskript.org'].includes(host)) {
      const user = u.pathname.split('/')[1] ?? ''
      return `${host}/<strong>${esc(user)}</strong>`
    }
    return `<strong>${esc(host)}</strong>`
  } catch {
    return ''
  }
}

export interface TagVorschlag {
  id: number
  name: string
  votes: number
  meinVote: boolean
}

// Vorschlags-Chip (gestrichelt) mit Vote-Zähler; 3 Stimmen machen den Tag offiziell.
export function tagVorschlagChip(v: TagVorschlag, eingeloggt: boolean): string {
  const label = `${esc(v.name)} ▲${v.votes}/3`
  if (!eingeloggt) return `<a class="qchip vorschlag" href="/login" title="Tag-Vorschlag der AI — anmelden zum Abstimmen">${label}</a>`
  return `<button class="qchip vorschlag${v.meinVote ? ' aktiv' : ''}" title="Tag-Vorschlag der AI — mit 3 Stimmen wird er offiziell" hx-post="/tagvote/${v.id}" hx-swap="outerHTML">${label}</button>`
}

// Filterleiste: Kopfzeile mit Kategorien (Tabs), darunter die Chips der gewählten
// Kategorie. Auswahl liegt in localStorage und überlebt Navigation; zugeklappte
// Kategorien mit aktiven Filtern zeigen einen blauen Punkt.
export function filterLeiste(quellen: string[], tags: string[], formate: string[], vorschlaege: TagVorschlag[] = [], eingeloggt = false): string {
  const chevron = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`
  const kategorien: [string, string, string[]][] = [
    ['quellen', 'Quellen', quellen],
    ['tags', 'Tags', tags],
    ['format', 'Format', formate],
  ]
  return `<div class="qfilter">
<div class="fkats">
${kategorien.map(([k, name]) => `<button class="fkat" data-k="${k}" onclick="fkatWaehlen('${k}')">${chevron}${name}<span class="punkt"></span></button>`).join('')}
<button class="fkat freset" onclick="filterReset()" title="Alle Filter zurücksetzen">reset</button>
</div>
${kategorien
  .map(
    ([k, , werte]) => `<div class="fchips" data-k="${k}">
${werte.map((w) => `<button class="qchip" data-fk="${k}" data-q="${esc(w)}" onclick="fltrToggle('${k}','${esc(w)}')">${esc(w)}<span class="chipzahl"></span></button>`).join('')}
${k === 'tags' ? vorschlaege.map((v) => tagVorschlagChip(v, eingeloggt)).join('') : ''}
</div>`
  )
  .join('\n')}
</div>`
}

export function materialKarte(m: MaterialKarte, eingeloggt: boolean, admin = false): string {
  return `<div class="karte" data-quelle="${esc(quellenKey(m.url))}" data-tags="${esc(m.tags.join(' '))}" data-format="${esc(m.format ?? '')}">
  <div style="display:flex;gap:.8rem;align-items:flex-start">
    <div style="flex:1">
      <h3><a href="${esc(m.url)}" rel="noopener">${esc(m.titel)}</a></h3>
      <div class="meta"><a href="#" class="quelle-link" title="Nur diese Quelle zeigen" onclick="quelleWaehlen('${esc(quellenKey(m.url))}');return false">${quellenLabel(m.url)}</a>${
        m.url.includes('#') ? ` · 📄 <span title="Datei im geteilten Ordner — der Link öffnet den Ordner">${esc(m.url.split('#')[1])}</span>` : ''
      }</div>
      <p style="margin:.2rem 0">${esc(m.zusammenfassung)}</p>
      <div>${m.format ? `<span class="tag format">${esc(m.format)}</span>` : ''}${m.tags.map((t) => `<a class="tag" href="/suche?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}
      ${m.zuordnungen.map((z) => `<a class="tag ziel" href="${z.href}" title="${esc(z.label)}">${esc(z.code)}</a>`).join('')}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem;align-items:center">
      ${voteButtons(m, eingeloggt)}
      ${admin ? `<button class="pfeil" title="Karte ausblenden (Admin)" hx-post="/admin/material/${m.id}/verstecken" hx-target="closest .karte" hx-swap="outerHTML" hx-confirm="Karte ausblenden?">✕</button>` : ''}
    </div>
  </div>
</div>`
}
