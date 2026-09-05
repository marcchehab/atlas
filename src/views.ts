// Server-rendered HTML als Template-Strings — bewusst ohne Template-Engine.

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function layout(titel: string, body: string, user?: { nickname: string } | null): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)} – Atlas</title>
<script src="/htmx.min.js"></script>
<style>
  :root { --akzent: #1a5fb4; --rand: #ddd; }
  body { font-family: system-ui, sans-serif; max-width: 52rem; margin: 0 auto; padding: 1rem; line-height: 1.5; color: #222; }
  header { display: flex; align-items: baseline; gap: 1rem; border-bottom: 2px solid var(--akzent); padding-bottom: .5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: 1.4rem; } header h1 a { color: var(--akzent); text-decoration: none; }
  header nav { margin-left: auto; display: flex; gap: .8rem; font-size: .9rem; }
  a { color: var(--akzent); }
  .karte { border: 1px solid var(--rand); border-radius: 8px; padding: .8rem 1rem; margin-bottom: .8rem; }
  .karte h3 { margin: 0 0 .3rem; font-size: 1.05rem; }
  .meta { font-size: .8rem; color: #666; }
  .tag { display: inline-block; background: #eef3fa; border-radius: 999px; padding: .05rem .6rem; font-size: .8rem; margin-right: .3rem; color: var(--akzent); text-decoration: none; }
  .upvote { border: 1px solid var(--rand); border-radius: 6px; background: #fff; cursor: pointer; padding: .2rem .6rem; font-size: .9rem; }
  .upvote.aktiv { background: var(--akzent); color: #fff; border-color: var(--akzent); }
  form.suche input[type=search] { width: 60%; padding: .4rem; }
  input, select, button { font: inherit; padding: .35rem .5rem; }
  .bereich { margin-top: 1.2rem; }
  .hinweis { background: #fff8e1; border: 1px solid #e6d9a0; border-radius: 6px; padding: .5rem .8rem; font-size: .85rem; }
  table { border-collapse: collapse; width: 100%; } td, th { text-align: left; padding: .3rem .5rem; border-bottom: 1px solid var(--rand); font-size: .9rem; }
</style>
</head>
<body>
<header>
  <h1><a href="/">Atlas</a></h1>
  <span class="meta">Unterrichtsmaterialien Schweizer Gymnasien</span>
  <nav>
    <a href="/melden">Quelle melden</a>
    <a href="/quellen">Quellen</a>
    ${user ? `<span>${esc(user.nickname)}</span> <a href="#" onclick="document.getElementById('lo').submit();return false">Abmelden</a><form id="lo" method="post" action="/logout" hidden></form>` : `<a href="/login">Anmelden</a>`}
  </nav>
</header>
${body}
</body></html>`
}

export interface MaterialKarte {
  id: number
  titel: string
  url: string
  zusammenfassung: string
  tags: string[]
  upvotes: number
  meinUpvote: boolean
  lernziele?: string[]
}

export function upvoteButton(m: { id: number; upvotes: number; meinUpvote: boolean }, eingeloggt: boolean): string {
  if (!eingeloggt) return `<a class="upvote" href="/login" title="Zum Upvoten anmelden">▲ ${m.upvotes}</a>`
  return `<button class="upvote${m.meinUpvote ? ' aktiv' : ''}" hx-post="/upvote/${m.id}" hx-swap="outerHTML">▲ ${m.upvotes}</button>`
}

export function materialKarte(m: MaterialKarte, eingeloggt: boolean): string {
  return `<div class="karte">
  <div style="display:flex;gap:.8rem;align-items:flex-start">
    <div style="flex:1">
      <h3><a href="${esc(m.url)}" rel="noopener">${esc(m.titel)}</a></h3>
      <p style="margin:.2rem 0">${esc(m.zusammenfassung)}</p>
      <div>${m.tags.map((t) => `<a class="tag" href="/suche?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}
      ${(m.lernziele ?? []).map((c) => `<a class="tag" style="background:#f3eefa" href="/lernziel/${esc(c)}">${esc(c)}</a>`).join('')}</div>
    </div>
    ${upvoteButton(m, eingeloggt)}
  </div>
</div>`
}
