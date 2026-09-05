// Server-rendered HTML als Template-Strings — bewusst ohne Template-Engine.
// Look angelehnt an Eduskript: Inter (UI), Barlow Condensed (Headings), #f5f5f5, Primärblau.

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function kürze(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

export function layout(titel: string, sidebar: string, body: string, user?: { nickname: string } | null): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)} – Atlas</title>
<script src="/htmx.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --primary: hsl(221.2 83.2% 53.3%); --bg: #f5f5f5; --fg: #262626; --rand: #e4e4e4; --meta: #737373; }
  * { box-sizing: border-box; }
  body { font-family: Inter, system-ui, sans-serif; margin: 0; background: var(--bg); color: var(--fg); line-height: 1.5; }
  h1, h2, h3 { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: .01em; }
  a { color: var(--primary); text-decoration: none; } a:hover { text-decoration: underline; }

  .app { display: flex; min-height: 100vh; }
  aside { width: 300px; flex-shrink: 0; background: #fff; border-right: 1px solid var(--rand); padding: 1rem; overflow-y: auto; position: sticky; top: 0; height: 100vh; }
  main { flex: 1; padding: 1.5rem 2rem; max-width: 56rem; }

  aside .logo { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 1.5rem; color: var(--primary); }
  aside .by { font-family: Inter, sans-serif; font-size: 11px; color: rgb(115 115 115 / .4); margin-left: .3rem; }
  aside .by:hover { color: var(--meta); text-decoration: none; }
  aside .untertitel { font-size: .75rem; color: var(--meta); margin-bottom: 1rem; }
  aside select { width: 100%; padding: .4rem; font: inherit; border: 1px solid var(--rand); border-radius: 6px; background: #fff; margin-bottom: 1rem; }
  .lg { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: .95rem; margin: .9rem 0 .2rem; }
  .tg, .ko { display: block; border-radius: 6px; padding: .15rem .5rem; color: var(--fg); font-size: .85rem; }
  .tg { font-weight: 600; margin-top: .15rem; }
  .ko { padding-left: 1.4rem; color: var(--meta); font-size: .8rem; }
  .tg:hover, .ko:hover { background: var(--bg); text-decoration: none; }
  .tg.aktiv, .ko.aktiv { background: var(--primary); color: #fff; }
  .anzahl { color: var(--meta); font-weight: 400; font-size: .75rem; }
  .tg.aktiv .anzahl, .ko.aktiv .anzahl { color: #cdd9f7; }
  aside .fuss { margin-top: 1.2rem; padding-top: .8rem; border-top: 1px solid var(--rand); font-size: .8rem; display: flex; flex-direction: column; gap: .3rem; }

  .karte { background: #fff; border: 1px solid var(--rand); border-radius: 10px; padding: .9rem 1.1rem; margin-bottom: .8rem; }
  .karte h3 { margin: 0 0 .3rem; font-size: 1.15rem; }
  .meta { font-size: .8rem; color: var(--meta); }
  .tag { display: inline-block; background: #eef3fa; border-radius: 999px; padding: .05rem .6rem; font-size: .78rem; margin-right: .3rem; color: var(--primary); }
  .tag.ziel { background: #f3eefa; }
  .voten { display: flex; flex-direction: column; align-items: center; gap: .1rem; }
  .voten .pfeil { border: 1px solid var(--rand); border-radius: 8px; background: #fff; color: var(--fg); cursor: pointer; padding: .1rem .55rem; font-size: .85rem; line-height: 1.3; font-family: inherit; }
  .voten .pfeil:hover { background: var(--bg); text-decoration: none; }
  .voten .pfeil.aktiv { background: var(--primary); color: #fff; border-color: var(--primary); }
  .voten .score { font-weight: 600; font-size: .95rem; }
  form.suche { display: flex; gap: .5rem; margin-bottom: 1.2rem; }
  form.suche input[type=search] { flex: 1; padding: .5rem .7rem; border: 1px solid var(--rand); border-radius: 8px; font: inherit; }
  input, select, button { font: inherit; }
  button { background: var(--primary); color: #fff; border: none; border-radius: 8px; padding: .5rem 1rem; cursor: pointer; }
  input[type=url], input[type=email], input[type=text], input:not([type]) { padding: .5rem .7rem; border: 1px solid var(--rand); border-radius: 8px; }
  .hinweis { background: #fff8e1; border: 1px solid #e6d9a0; border-radius: 8px; padding: .5rem .8rem; font-size: .85rem; }
  table { border-collapse: collapse; width: 100%; background: #fff; border-radius: 10px; }
  td, th { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid var(--rand); font-size: .88rem; }
</style>
</head>
<body>
<div class="app">
<aside>${sidebar}</aside>
<main>${body}</main>
</div>
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
  user?: { nickname: string } | null
}

export function sidebar(d: SidebarDaten): string {
  const basis = `/fach/${d.fachCode}`
  return `<div style="margin-bottom:.2rem"><a class="logo" href="${basis}">Atlas</a><a class="by" href="https://eduskript.org" target="_blank" rel="noopener">by Eduskript</a></div>
<div class="untertitel">Unterrichtsmaterialien Schweizer Gymnasien</div>
<select onchange="location='/fach/'+this.value">
${d.faecher.map((f) => `<option value="${esc(f.code)}"${f.code === d.fachCode ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}
</select>
${d.lerngebiete
  .map(
    (lg) => `<div class="lg">${lg.nummer}. ${esc(lg.name)}</div>
${lg.teilgebiete
  .map(
    (tg) => `<a class="tg${d.aktiv === 'T' + tg.code ? ' aktiv' : ''}" href="${basis}/t/${tg.code}">${tg.code} ${esc(tg.name)} <span class="anzahl">${tg.anzahl || ''}</span></a>
${tg.kompetenzen
  .map((ko) => `<a class="ko${d.aktiv === 'K' + ko.code ? ' aktiv' : ''}" href="${basis}/k/${ko.code}" title="${esc(ko.text)}">${esc(kürze(ko.text, 48))} <span class="anzahl">${ko.anzahl || ''}</span></a>`)
  .join('\n')}`
  )
  .join('\n')}`
  )
  .join('\n')}
<div class="fuss">
  ${d.lehrplanUrl ? `<a href="${esc(d.lehrplanUrl)}" rel="noopener">Lehrplan (Original-PDF)</a>` : ''}
  <a href="/suche">Suche</a>
  <a href="/melden">Quelle melden</a>
  <a href="/quellen">Quellen</a>
  ${d.user ? `<span class="meta">${esc(d.user.nickname)} · <a href="#" onclick="document.getElementById('lo').submit();return false">abmelden</a></span><form id="lo" method="post" action="/logout" hidden></form>` : `<a href="/login">Anmelden</a>`}
</div>`
}

export interface MaterialKarte {
  id: number
  titel: string
  url: string
  zusammenfassung: string
  tags: string[]
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

export function materialKarte(m: MaterialKarte, eingeloggt: boolean): string {
  return `<div class="karte">
  <div style="display:flex;gap:.8rem;align-items:flex-start">
    <div style="flex:1">
      <h3><a href="${esc(m.url)}" rel="noopener">${esc(m.titel)}</a></h3>
      <p style="margin:.2rem 0">${esc(m.zusammenfassung)}</p>
      <div>${m.tags.map((t) => `<a class="tag" href="/suche?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}
      ${m.zuordnungen.map((z) => `<a class="tag ziel" href="${z.href}" title="${esc(z.label)}">${esc(z.code)}</a>`).join('')}</div>
    </div>
    ${voteButtons(m, eingeloggt)}
  </div>
</div>`
}
