import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { prisma, initDb, normalizeUrl, erkenneTyp } from './db.js'
import { crawlQuelle } from './crawler.js'
import { layout, esc, materialKarte, upvoteButton, MaterialKarte } from './views.js'

const app = express()
const SECRET = process.env.SESSION_SECRET ?? 'dev'
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser(SECRET))
app.use(express.static(path.join(process.cwd(), 'public')))

interface Nutzer { id: number; nickname: string }

async function aktuellerUser(req: express.Request): Promise<Nutzer | null> {
  const id = Number(req.signedCookies?.uid)
  if (!id) return null
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, nickname: true } })
  return u ?? null
}

async function ladeMaterialKarten(where: object, userId: number | null): Promise<MaterialKarte[]> {
  const mats = await prisma.material.findMany({
    where: { ...where, quelle: { todesCounter: { lt: 3 } } },
    include: {
      tags: { include: { tag: true } },
      lernziele: { include: { lernziel: true } },
      upvotes: true,
      quelle: { select: { qualityScore: true } },
    },
  })
  return mats
    .map((m) => ({
      id: m.id,
      titel: m.titel,
      url: m.url,
      zusammenfassung: m.zusammenfassung,
      tags: m.tags.map((t) => t.tag.name),
      lernziele: m.lernziele.map((l) => l.lernziel.code),
      upvotes: m.upvotes.length,
      meinUpvote: userId != null && m.upvotes.some((u) => u.userId === userId),
      score: m.quelle.qualityScore ?? 0,
    }))
    // Ranking: Upvotes zuerst, AI-Score nur als Initial-Ranking dahinter
    .sort((a, b) => b.upvotes - a.upvotes || b.score - a.score)
}

// Startseite: Lernziel-Navigation ist der primäre Zugang
app.get('/', async (req, res) => {
  const user = await aktuellerUser(req)
  const ziele = await prisma.lernziel.findMany({
    orderBy: { code: 'asc' },
    include: { _count: { select: { eintraege: true } } },
  })
  const bereiche = new Map<string, typeof ziele>()
  for (const z of ziele) {
    if (!bereiche.has(z.bereich)) bereiche.set(z.bereich, [])
    bereiche.get(z.bereich)!.push(z)
  }
  const body = `
<form class="suche" action="/suche">
  <input type="search" name="q" placeholder="Volltextsuche, z.B. binärsystem arbeitsblatt" value="">
  <button>Suchen</button>
</form>
<p class="hinweis">Prototyp — Lernziele sind Platzhalter, noch nicht die echten RLP-2024-Ziele.</p>
${[...bereiche.entries()]
  .map(
    ([bereich, zs]) => `<div class="bereich"><h2>${esc(bereich)}</h2>
${zs
  .map(
    (z) =>
      `<div><a href="/lernziel/${esc(z.code)}"><strong>${esc(z.code)}</strong> ${esc(z.text)}</a> <span class="meta">(${z._count.eintraege})</span></div>`
  )
  .join('\n')}</div>`
  )
  .join('\n')}`
  res.send(layout('Lernziele', body, user))
})

app.get('/lernziel/:code', async (req, res) => {
  const user = await aktuellerUser(req)
  const ziel = await prisma.lernziel.findUnique({ where: { code: req.params.code } })
  if (!ziel) return res.status(404).send(layout('Nicht gefunden', '<p>Lernziel nicht gefunden.</p>', user))
  const karten = await ladeMaterialKarten({ lernziele: { some: { lernzielId: ziel.id } } }, user?.id ?? null)
  const body = `<h2>${esc(ziel.code)} — ${esc(ziel.text)}</h2>
<p class="meta">${esc(ziel.fach)} · ${esc(ziel.bereich)}</p>
${karten.length ? karten.map((k) => materialKarte(k, !!user)).join('\n') : '<p>Noch keine Materialien. <a href="/melden">Quelle melden?</a></p>'}`
  res.send(layout(ziel.code, body, user))
})

// Volltextsuche (FTS5) und Tag-Filter
app.get('/suche', async (req, res) => {
  const user = await aktuellerUser(req)
  const q = String(req.query.q ?? '').trim()
  const tag = String(req.query.tag ?? '').trim()
  let karten: MaterialKarte[] = []
  if (tag) {
    karten = await ladeMaterialKarten({ tags: { some: { tag: { name: tag } } } }, user?.id ?? null)
  } else if (q) {
    // FTS5 über $queryRaw; Anfrage in Anführungszeichen = keine FTS-Syntax-Injektion
    const ftsQuery = q
      .split(/\s+/)
      .map((w) => `"${w.replace(/"/g, '')}"`)
      .join(' ')
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT rowid AS id FROM material_fts WHERE material_fts MATCH ? ORDER BY rank LIMIT 50`,
      ftsQuery
    )
    karten = await ladeMaterialKarten({ id: { in: rows.map((r) => Number(r.id)) } }, user?.id ?? null)
  }
  const body = `<form class="suche" action="/suche">
  <input type="search" name="q" value="${esc(q)}" placeholder="Volltextsuche">
  <button>Suchen</button>
</form>
${tag ? `<h2>Tag: ${esc(tag)}</h2>` : q ? `<h2>Resultate für «${esc(q)}»</h2>` : ''}
${karten.length ? karten.map((k) => materialKarte(k, !!user)).join('\n') : '<p>Keine Treffer.</p>'}`
  res.send(layout('Suche', body, user))
})

// Melden: nur mit Login (Kostenbremse) — Quelle wird sofort gecrawlt, damit man das Resultat sieht
app.get('/melden', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!user) return res.redirect('/login?weiter=/melden')
  const body = `<h2>Quelle melden</h2>
<p>Nur ein Link — den Rest macht Atlas (Crawling, Zuordnung zu Lernzielen, Zusammenfassung).</p>
<form method="post">
  <p><input type="url" name="url" required placeholder="https://…" style="width:100%"></p>
  <p><select name="fach"><option value="">Fach (optional)</option><option>Informatik</option></select></p>
  <p><button>Melden</button></p>
</form>`
  res.send(layout('Quelle melden', body, user))
})

app.post('/melden', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!user) return res.redirect('/login')
  let url: string
  try {
    url = normalizeUrl(String(req.body.url))
  } catch {
    return res.send(layout('Fehler', '<p>Ungültige URL.</p><p><a href="/melden">Zurück</a></p>', user))
  }
  const existiert = await prisma.quelle.findUnique({ where: { url } })
  if (existiert) {
    return res.send(layout('Schon vorhanden', `<p>Diese Quelle ist schon gemeldet${existiert.titel ? `: <strong>${esc(existiert.titel)}</strong>` : ''}.</p><p><a href="/">Zur Übersicht</a></p>`, user))
  }
  const quelle = await prisma.quelle.create({
    data: { url, typ: erkenneTyp(url), fach: String(req.body.fach || '') || null, melderId: user.id },
  })
  const resultat = await crawlQuelle(quelle.id) // Prototyp: synchron; produktiv im nächtlichen Worker
  const body = `<h2>Gemeldet</h2>
<p><code>${esc(url)}</code></p>
<p>Crawl-Resultat: <strong>${esc(resultat)}</strong></p>
<p><a href="/">Zur Übersicht</a> · <a href="/quellen">Alle Quellen</a></p>`
  res.send(layout('Gemeldet', body, user))
})

app.get('/quellen', async (req, res) => {
  const user = await aktuellerUser(req)
  const quellen = await prisma.quelle.findMany({ orderBy: { createdAt: 'desc' }, include: { melder: true, _count: { select: { materialien: true } } } })
  const body = `<h2>Quellen</h2>
<table><tr><th>URL</th><th>Typ</th><th>Score</th><th>☠</th><th>Materialien</th><th>Melder:in</th></tr>
${quellen
  .map(
    (q) =>
      `<tr><td><a href="${esc(q.url)}" rel="noopener">${esc(q.titel ?? q.url)}</a></td><td>${esc(q.typ)}</td><td>${q.qualityScore ?? '–'}</td><td>${q.todesCounter}</td><td>${q._count.materialien}</td><td>${esc(q.melder.nickname)}</td></tr>`
  )
  .join('\n')}</table>`
  res.send(layout('Quellen', body, user))
})

// Upvote-Toggle (HTMX)
app.post('/upvote/:id', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!user) return res.status(401).send('')
  const materialId = Number(req.params.id)
  const key = { userId_materialId: { userId: user.id, materialId } }
  const vorhanden = await prisma.upvote.findUnique({ where: key })
  if (vorhanden) await prisma.upvote.delete({ where: key })
  else await prisma.upvote.create({ data: { userId: user.id, materialId } })
  const n = await prisma.upvote.count({ where: { materialId } })
  res.send(upvoteButton({ id: materialId, upvotes: n, meinUpvote: !vorhanden }, true))
})

// Auth-Stub: Nickname + E-Mail. TODO produktiv: better-auth (Microsoft OAuth + Magic-Link).
app.get('/login', async (req, res) => {
  const body = `<h2>Anmelden</h2>
<p class="hinweis">Prototyp-Login ohne Verifikation. Produktiv: Microsoft-OAuth + Magic-Link (better-auth).</p>
<form method="post">
  <input type="hidden" name="weiter" value="${esc(String(req.query.weiter ?? '/'))}">
  <p><input name="nickname" required placeholder="Nickname"></p>
  <p><input type="email" name="email" required placeholder="E-Mail"></p>
  <p><button>Anmelden</button></p>
</form>`
  res.send(layout('Anmelden', body, null))
})

app.post('/login', async (req, res) => {
  const email = String(req.body.email ?? '').toLowerCase().trim()
  const nickname = String(req.body.nickname ?? '').trim()
  if (!email || !nickname) return res.redirect('/login')
  const user = await prisma.user.upsert({ where: { email }, create: { email, nickname }, update: {} })
  res.cookie('uid', String(user.id), { signed: true, httpOnly: true, sameSite: 'lax' })
  res.redirect(String(req.body.weiter ?? '/'))
})

app.post('/logout', (_req, res) => {
  res.clearCookie('uid')
  res.redirect('/')
})

const PORT = Number(process.env.PORT ?? 3000)
initDb().then(() => {
  app.listen(PORT, () => console.log(`Atlas läuft auf http://localhost:${PORT}`))
})
