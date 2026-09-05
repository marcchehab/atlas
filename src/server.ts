import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { prisma, initDb, normalizeUrl, erkenneTyp } from './db.js'
import { crawlQuelle } from './crawler.js'
import { layout, esc, kürze, sidebar, materialKarte, upvoteButton, MaterialKarte } from './views.js'

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

const STANDARD_FACH = 'informatik-gf'

async function baueSidebar(fachCode: string, aktiv: string | undefined, user: Nutzer | null): Promise<string> {
  const faecher = await prisma.fach.findMany({ orderBy: { name: 'asc' }, select: { code: true, name: true } })
  const fach = await prisma.fach.findUnique({
    where: { code: fachCode },
    include: {
      lerngebiete: {
        orderBy: { nummer: 'asc' },
        include: {
          teilgebiete: {
            orderBy: { code: 'asc' },
            include: {
              _count: { select: { zuordnungen: true } },
              kompetenzen: { orderBy: { code: 'asc' }, include: { _count: { select: { zuordnungen: true } } } },
            },
          },
        },
      },
    },
  })
  if (!fach) return sidebar({ faecher, fachCode, lehrplanUrl: null, lerngebiete: [], aktiv, user })
  return sidebar({
    faecher,
    fachCode,
    lehrplanUrl: fach.lehrplanUrl,
    lerngebiete: fach.lerngebiete.map((lg) => ({
      nummer: lg.nummer,
      name: lg.name,
      teilgebiete: lg.teilgebiete.map((tg) => ({
        code: tg.code,
        name: tg.name,
        anzahl: tg._count.zuordnungen, // teilgebietId ist auch bei Kompetenz-Zuordnung gesetzt → Gesamtzahl
        kompetenzen: tg.kompetenzen.map((ko) => ({ code: ko.code, text: ko.text, anzahl: ko._count.zuordnungen })),
      })),
    })),
    aktiv,
    user,
  })
}

async function ladeMaterialKarten(where: object, userId: number | null, fachCode: string): Promise<MaterialKarte[]> {
  const mats = await prisma.material.findMany({
    where: { ...where, quelle: { todesCounter: { lt: 3 } } },
    include: {
      tags: { include: { tag: true } },
      zuordnungen: { include: { teilgebiet: true, kompetenz: true } },
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
      zuordnungen: m.zuordnungen.map((z) =>
        z.kompetenz
          ? { code: z.kompetenz.code, label: z.kompetenz.text, href: `/fach/${fachCode}/k/${z.kompetenz.code}` }
          : { code: `${z.teilgebiet.code} (ganz)`, label: z.teilgebiet.name, href: `/fach/${fachCode}/t/${z.teilgebiet.code}` }
      ),
      upvotes: m.upvotes.length,
      meinUpvote: userId != null && m.upvotes.some((u) => u.userId === userId),
      score: m.quelle.qualityScore ?? 0,
    }))
    // Ranking: Upvotes zuerst, AI-Score nur als Initial-Ranking dahinter
    .sort((a, b) => b.upvotes - a.upvotes || b.score - a.score)
}

app.get('/', (_req, res) => res.redirect(`/fach/${STANDARD_FACH}`))

// Fach-Übersicht
app.get('/fach/:fach', async (req, res) => {
  const user = await aktuellerUser(req)
  const fach = await prisma.fach.findUnique({ where: { code: req.params.fach } })
  if (!fach) return res.status(404).send('Fach nicht gefunden')
  const side = await baueSidebar(fach.code, undefined, user)
  const neueste = await ladeMaterialKarten({}, user?.id ?? null, fach.code)
  const body = `<h1>${esc(fach.name)}</h1>
<p>Materialien geordnet nach dem <a href="${esc(fach.lehrplanUrl ?? '#')}" rel="noopener">Rahmenlehrplan Maturitätsschulen (EDK 2024)</a>.
Links ein Teilgebiet oder eine Kompetenz wählen — oder <a href="/suche">Volltextsuche</a>.</p>
<form class="suche" action="/suche"><input type="search" name="q" placeholder="Volltextsuche, z.B. binärsystem arbeitsblatt"><button>Suchen</button></form>
<h2>Alle Materialien (${neueste.length})</h2>
${neueste.length ? neueste.map((k) => materialKarte(k, !!user)).join('\n') : '<p>Noch keine Materialien. <a href="/melden">Quelle melden?</a></p>'}`
  res.send(layout(fach.name, side, body, user))
})

// Teilgebiet: Materialien des Teilgebiets inkl. seiner Kompetenzen
app.get('/fach/:fach/t/:code', async (req, res) => {
  const user = await aktuellerUser(req)
  const tg = await prisma.teilgebiet.findFirst({
    where: { code: req.params.code, lerngebiet: { fach: { code: req.params.fach } } },
    include: { lerngebiet: true, kompetenzen: { orderBy: { code: 'asc' } } },
  })
  if (!tg) return res.status(404).send('Teilgebiet nicht gefunden')
  const side = await baueSidebar(req.params.fach, `T${tg.code}`, user)
  const karten = await ladeMaterialKarten({ zuordnungen: { some: { teilgebietId: tg.id } } }, user?.id ?? null, req.params.fach)
  const body = `<h1>${esc(tg.code)} ${esc(tg.name)}</h1>
<p class="meta">${tg.lerngebiet.nummer}. ${esc(tg.lerngebiet.name)}</p>
<ul class="meta">${tg.kompetenzen.map((k) => `<li>${esc(k.text)}</li>`).join('')}</ul>
${karten.length ? karten.map((k) => materialKarte(k, !!user)).join('\n') : '<p>Noch keine Materialien. <a href="/melden">Quelle melden?</a></p>'}`
  res.send(layout(`${tg.code} ${tg.name}`, side, body, user))
})

// Einzelne Kompetenz
app.get('/fach/:fach/k/:code', async (req, res) => {
  const user = await aktuellerUser(req)
  const ko = await prisma.kompetenz.findFirst({
    where: { code: req.params.code, teilgebiet: { lerngebiet: { fach: { code: req.params.fach } } } },
    include: { teilgebiet: { include: { lerngebiet: true } } },
  })
  if (!ko) return res.status(404).send('Kompetenz nicht gefunden')
  const side = await baueSidebar(req.params.fach, `K${ko.code}`, user)
  const karten = await ladeMaterialKarten({ zuordnungen: { some: { kompetenzId: ko.id } } }, user?.id ?? null, req.params.fach)
  const body = `<h1>${esc(ko.code)}</h1>
<p>Die Maturandinnen und Maturanden können <strong>${esc(ko.text)}</strong>.</p>
<p class="meta"><a href="/fach/${esc(req.params.fach)}/t/${esc(ko.teilgebiet.code)}">${esc(ko.teilgebiet.code)} ${esc(ko.teilgebiet.name)}</a> · ${ko.teilgebiet.lerngebiet.nummer}. ${esc(ko.teilgebiet.lerngebiet.name)}</p>
${karten.length ? karten.map((k) => materialKarte(k, !!user)).join('\n') : '<p>Noch keine Materialien. <a href="/melden">Quelle melden?</a></p>'}`
  res.send(layout(ko.code, side, body, user))
})

// Volltextsuche (FTS5) und Tag-Filter
app.get('/suche', async (req, res) => {
  const user = await aktuellerUser(req)
  const q = String(req.query.q ?? '').trim()
  const tag = String(req.query.tag ?? '').trim()
  let karten: MaterialKarte[] = []
  if (tag) {
    karten = await ladeMaterialKarten({ tags: { some: { tag: { name: tag } } } }, user?.id ?? null, STANDARD_FACH)
  } else if (q) {
    // FTS5 über $queryRaw; Anfrage in Anführungszeichen = keine FTS-Syntax-Injektion
    const ftsQuery = q.split(/\s+/).map((w) => `"${w.replace(/"/g, '')}"`).join(' ')
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT rowid AS id FROM material_fts WHERE material_fts MATCH ? ORDER BY rank LIMIT 50`,
      ftsQuery
    )
    karten = await ladeMaterialKarten({ id: { in: rows.map((r) => Number(r.id)) } }, user?.id ?? null, STANDARD_FACH)
  }
  const side = await baueSidebar(STANDARD_FACH, undefined, user)
  const body = `<h1>Suche</h1>
<form class="suche"><input type="search" name="q" value="${esc(q)}" placeholder="Volltextsuche"><button>Suchen</button></form>
${tag ? `<h2>Tag: ${esc(tag)}</h2>` : q ? `<h2>Resultate für «${esc(q)}»</h2>` : ''}
${(q || tag) ? (karten.length ? karten.map((k) => materialKarte(k, !!user)).join('\n') : '<p>Keine Treffer.</p>') : ''}`
  res.send(layout('Suche', side, body, user))
})

// Melden: nur mit Login (Kostenbremse) — Quelle wird sofort gecrawlt, damit man das Resultat sieht
app.get('/melden', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!user) return res.redirect('/login?weiter=/melden')
  const faecher = await prisma.fach.findMany({ select: { code: true, name: true } })
  const side = await baueSidebar(STANDARD_FACH, undefined, user)
  const body = `<h1>Quelle melden</h1>
<p>Nur ein Link — den Rest macht Atlas (Crawling, Zuordnung zum Lehrplan, Zusammenfassung).</p>
<form method="post">
  <p><input type="url" name="url" required placeholder="https://…" style="width:100%"></p>
  <p><select name="fach"><option value="">Fach (optional)</option>${faecher.map((f) => `<option value="${esc(f.code)}">${esc(f.name)}</option>`).join('')}</select></p>
  <p><button>Melden</button></p>
</form>`
  res.send(layout('Quelle melden', side, body, user))
})

app.post('/melden', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!user) return res.redirect('/login')
  const side = await baueSidebar(STANDARD_FACH, undefined, user)
  let url: string
  try {
    url = normalizeUrl(String(req.body.url))
  } catch {
    return res.send(layout('Fehler', side, '<p>Ungültige URL.</p><p><a href="/melden">Zurück</a></p>', user))
  }
  const existiert = await prisma.quelle.findUnique({ where: { url } })
  if (existiert) {
    return res.send(layout('Schon vorhanden', side, `<p>Diese Quelle ist schon gemeldet${existiert.titel ? `: <strong>${esc(existiert.titel)}</strong>` : ''}.</p><p><a href="/">Zur Übersicht</a></p>`, user))
  }
  const quelle = await prisma.quelle.create({
    data: { url, typ: erkenneTyp(url), fach: String(req.body.fach || '') || null, melderId: user.id },
  })
  const resultat = await crawlQuelle(quelle.id) // Prototyp: synchron; produktiv im nächtlichen Worker
  const body = `<h1>Gemeldet</h1>
<p><code>${esc(url)}</code></p>
<p>Crawl-Resultat: <strong>${esc(resultat)}</strong></p>
<p><a href="/">Zur Übersicht</a> · <a href="/quellen">Alle Quellen</a></p>`
  res.send(layout('Gemeldet', side, body, user))
})

app.get('/quellen', async (req, res) => {
  const user = await aktuellerUser(req)
  const side = await baueSidebar(STANDARD_FACH, undefined, user)
  const quellen = await prisma.quelle.findMany({ orderBy: { createdAt: 'desc' }, include: { melder: true, _count: { select: { materialien: true } } } })
  const body = `<h1>Quellen</h1>
<table><tr><th>URL</th><th>Typ</th><th>Score</th><th>☠</th><th>Materialien</th><th>Melder:in</th></tr>
${quellen
  .map(
    (q) =>
      `<tr><td><a href="${esc(q.url)}" rel="noopener">${esc(kürze(q.titel ?? q.url, 60))}</a></td><td>${esc(q.typ)}</td><td>${q.qualityScore ?? '–'}</td><td>${q.todesCounter}</td><td>${q._count.materialien}</td><td>${esc(q.melder.nickname)}</td></tr>`
  )
  .join('\n')}</table>`
  res.send(layout('Quellen', side, body, user))
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
  const side = await baueSidebar(STANDARD_FACH, undefined, null)
  const body = `<h1>Anmelden</h1>
<p class="hinweis">Prototyp-Login ohne Verifikation. Produktiv: Microsoft-OAuth + Magic-Link (better-auth).</p>
<form method="post">
  <input type="hidden" name="weiter" value="${esc(String(req.query.weiter ?? '/'))}">
  <p><input name="nickname" required placeholder="Nickname"></p>
  <p><input type="email" name="email" required placeholder="E-Mail"></p>
  <p><button>Anmelden</button></p>
</form>`
  res.send(layout('Anmelden', side, body, null))
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
