import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import fs from 'node:fs/promises'
import { prisma, initDb, normalizeUrl, erkenneTyp } from './db.js'
import { crawlQuelle } from './crawler.js'
import * as auth from './auth.js'
import { sendeMail } from './mail.js'
import { pruefeOeffentlich } from './netz.js'
import { SCORE_PROMPT, SCORE_BAENDER } from './ai.js'
import { layout, esc, kürze, sidebar, materialKarte, voteButtons, loginSeite, filterLeiste, tagVorschlagChip, quellenKey, MaterialKarte, TagVorschlag, FilterChip, BASE_URL, tgPfad, koPfad, grossErst } from './views.js'

const app = express()
const SECRET = process.env.SESSION_SECRET ?? 'dev'
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser(SECRET))
app.use(express.static(path.join(process.cwd(), 'public')))

interface Nutzer { id: number; nickname: string; istAdmin: boolean }

async function aktuellerUser(req: express.Request): Promise<Nutzer | null> {
  const id = Number(req.signedCookies?.uid)
  if (!id) return null
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, nickname: true, istAdmin: true } })
  return u ?? null
}

const STANDARD_LEHRPLAN = 'informatik-gf'

// Navigationseinheit ist der Lehrplan (Dropdown in der Sidebar). Zuletzt besuchter Lehrplan
// im Cookie — Seiten ohne Lehrplan-Bezug (Admin, Quellen, Suche …) behalten so den Kontext.
function merkeLehrplan(res: express.Response, code: string) {
  res.cookie('lehrplan', code, { sameSite: 'lax', maxAge: 180 * 24 * 3600 * 1000 })
}
async function aktiverLehrplan(req: express.Request): Promise<string> {
  const code = String(req.cookies?.lehrplan ?? '')
  if (code && (await prisma.lehrplan.findUnique({ where: { code } }))) return code
  return STANDARD_LEHRPLAN
}
const lehrplanLabel = (lp: { name: string; fach: { name: string } }) => `${lp.fach.name} · ${lp.name}`

// Sidebar: Lehrplan-Dropdown (nach Fach gruppiert), darunter der Baum des aktiven Lehrplans.
// aktiv markiert Teilgebiet/Kompetenz als "T1.2" bzw. "K1.2.1".
async function baueSidebar(lpCode: string, aktiv: string | undefined, user: Nutzer | null): Promise<string> {
  const alle = await prisma.lehrplan.findMany({ include: { fach: true }, orderBy: [{ fach: { name: 'asc' } }, { id: 'asc' }] })
  const lehrplaene = alle.map((lp) => ({ code: lp.code, name: lp.name, fach: lp.fach.name }))
  const lp = await prisma.lehrplan.findUnique({
    where: { code: lpCode },
    include: {
      fach: true,
      lerngebiete: {
        orderBy: { nummer: 'asc' },
        include: {
          teilgebiete: {
            orderBy: { code: 'asc' },
            include: {
              _count: { select: { zuordnungen: { where: { material: { fehlCounter: { lt: 3 } } } } } },
              kompetenzen: {
                orderBy: { code: 'asc' },
                include: { _count: { select: { zuordnungen: { where: { material: { fehlCounter: { lt: 3 } } } } } } },
              },
            },
          },
        },
      },
    },
  })
  if (!lp) return sidebar({ lehrplaene, lpCode, fachCode: '', url: null, lerngebiete: [], aktiv, user })
  return sidebar({
    lehrplaene,
    lpCode,
    fachCode: lp.fach.code,
    url: lp.url,
    lerngebiete: lp.lerngebiete.map((lg) => ({
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
    where: { ...where, fehlCounter: { lt: 3 }, versteckt: false, qualityScore: { gte: 20 }, quelle: { todesCounter: { lt: 3 } } },
    include: {
      tags: { include: { tag: true } },
      zuordnungen: { include: { teilgebiet: { include: { lerngebiet: { include: { lehrplan: true } } } }, kompetenz: true } },
      upvotes: true,
    },
  })
  return mats
    .map((m) => ({
      id: m.id,
      titel: m.titel,
      url: m.url,
      zusammenfassung: m.zusammenfassung,
      tags: m.tags.map((t) => t.tag.name),
      format: m.format,
      // Chips verlinken in den Lehrplan der jeweiligen Zuordnung — nicht ins Fach der Seite
      zuordnungen: m.zuordnungen.map((z) => {
        const fc = z.teilgebiet.lerngebiet.lehrplan.code
        return z.kompetenz
          ? { code: z.kompetenz.code, label: z.kompetenz.text, href: koPfad(fc, z.kompetenz.code, z.kompetenz.text) }
          : { code: `${z.teilgebiet.code} (ganz)`, label: z.teilgebiet.name, href: tgPfad(fc, z.teilgebiet.code, z.teilgebiet.name) }
      }),
      fachCode,
      score: m.upvotes.reduce((s, u) => s + u.wert, 0),
      meinVote: m.upvotes.find((u) => u.userId === userId)?.wert ?? 0,
      aiScore: m.qualityScore ?? 0,
    }))
    // Ranking: Community-Votes zuerst, AI-Score nur als Initial-Ranking dahinter
    .sort((a, b) => sortScore(b) - sortScore(a) || b.id - a.id)
}

const SEITE = 50 // Karten pro Nachlade-Schritt (Endlos-Scroll)

interface ListenFilter {
  quellen: string[]
  tags: string[]
  format: string[]
  q: string // Volltextsuche innerhalb der Liste (FTS5)
}

function leseFilter(req: express.Request): ListenFilter {
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : v != null ? [String(v)] : [])
  return { quellen: arr(req.query.quelle), tags: arr(req.query.tag), format: arr(req.query.fmt), q: String(req.query.q ?? '').trim() }
}

// FTS5-Anfrage: Wörter gequotet (keine FTS-Syntax-Injektion), ab 3 Zeichen als Präfix —
// «Grammar» findet «Grammars», «Schleife» findet «Schleifen». Der unicode61-Tokenizer
// kennt kein Stemming, und Porter wäre nur englisch.
function ftsAnfrage(woerter: string[]): string {
  return woerter.map((w) => {
    const rein = w.replace(/"/g, '')
    return `"${rein}"${rein.length >= 3 ? '*' : ''}`
  }).join(' ')
}

// FTS5-Volltextsuche → Material-Ids
async function ftsIds(q: string): Promise<Set<number>> {
  const ftsQuery = ftsAnfrage(q.split(/\s+/))
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT rowid AS id FROM material_fts WHERE material_fts MATCH ? ORDER BY rank LIMIT 500`,
    ftsQuery
  )
  return new Set(rows.map((r) => Number(r.id)))
}

// Ranking: AI-Band (0–100) plus 5 Punkte pro Netto-Stimme; bei Gleichstand das Neuere zuerst
const sortScore = (m: { score: number; aiScore: number }) => m.aiScore + 5 * m.score

interface LeichtesMaterial {
  id: number
  quelle: string
  tags: string[]
  format: string
  score: number
  aiScore: number
}

// Schlanke Liste aller sichtbaren Materialien eines Kontexts — Grundlage für Chip-Zahlen,
// Sortierung und Slice. Die teuren Includes (Zuordnungen, Zusammenfassung, meinVote)
// lädt erst ladeMaterialKarten für die 50 Karten des Batches.
async function ladeLeicht(where: object): Promise<LeichtesMaterial[]> {
  const mats = await prisma.material.findMany({
    where: { ...where, ...SICHTBAR },
    select: {
      id: true,
      url: true,
      format: true,
      qualityScore: true,
      tags: { select: { tag: { select: { name: true } } } },
      upvotes: { select: { wert: true } },
    },
  })
  return mats.map((m) => ({
    id: m.id,
    quelle: quellenKey(m.url),
    tags: m.tags.map((t) => t.tag.name),
    format: m.format ?? '',
    score: m.upvotes.reduce((s, u) => s + u.wert, 0),
    aiScore: m.qualityScore ?? 0,
  }))
}

// Passt m zu den Filtern? `ausser` blendet eine Kategorie aus — für die Chip-Zahlen
// (Zahl eines Chips = Treffer unter den Filtern der jeweils anderen Kategorien).
function passtAusser(m: LeichtesMaterial, f: ListenFilter, ausser: keyof ListenFilter | null): boolean {
  return (
    (ausser === 'quellen' || !f.quellen.length || f.quellen.includes(m.quelle)) &&
    (ausser === 'tags' || !f.tags.length || m.tags.some((x) => f.tags.includes(x))) &&
    (ausser === 'format' || !f.format.length || f.format.includes(m.format))
  )
}

// Chip-Listen sind global (alle Quellen/Tags/Formate wie bisher); die Zahlen zählen
// den aktuellen Kontext (`leicht`) unter dem Filterstand `f`.
async function filterDaten(userId: number | null, leicht: LeichtesMaterial[], f: ListenFilter): Promise<[FilterChip[], FilterChip[], FilterChip[], TagVorschlag[]]> {
  // Nur Quellen mit sichtbaren Materialien — leere/tote gehören nicht in die Filterleiste
  const quellen = await prisma.quelle.findMany({
    where: { todesCounter: { lt: 3 }, materialien: { some: { qualityScore: { gte: 20 }, versteckt: false, fehlCounter: { lt: 3 } } } },
    select: { url: true },
  })
  const tags = await prisma.tag.findMany({ where: { status: 'AKTIV' }, orderBy: { name: 'asc' }, select: { name: true } })
  const formate = await prisma.material.findMany({ where: { format: { not: null } }, select: { format: true }, distinct: ['format'] })
  const vorschlaege = await prisma.tag.findMany({
    where: { status: 'VORSCHLAG' },
    orderBy: [{ name: 'asc' }],
    include: { votes: true },
  })
  const chip = (kat: keyof ListenFilter, wert: string, hat: (m: LeichtesMaterial) => boolean): FilterChip => ({
    wert,
    aktiv: f[kat].includes(wert),
    anzahl: leicht.filter((m) => hat(m) && passtAusser(m, f, kat)).length,
  })
  // Chips ohne Treffer im aktuellen Kontext (z.B. Informatik-Quellen auf der Physik-Seite)
  // ausblenden — ausser sie sind gerade aktiv gefiltert
  const sichtbar = (c: FilterChip) => c.anzahl > 0 || c.aktiv
  return [
    [...new Set(quellen.map((q) => quellenKey(q.url)))].sort().map((w) => chip('quellen', w, (m) => m.quelle === w)).filter(sichtbar),
    tags.map((t) => chip('tags', t.name, (m) => m.tags.includes(t.name))).filter(sichtbar),
    formate.map((x) => x.format!).sort().map((w) => chip('format', w, (m) => m.format === w)).filter(sichtbar),
    vorschlaege
      .map((v) => ({ id: v.id, name: v.name, votes: v.votes.length, meinVote: userId != null && v.votes.some((x) => x.userId === userId) }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
      .slice(0, 5), // mehr Vorschläge überfordern die Leiste — Rest wartet im Admin
  ]
}

// Ein Batch der Materialliste: 50 Karten + Sentinel, das beim Insichtscrollen den
// nächsten Batch nachlädt; bei offset 0 zusätzlich die Filterleiste zum Filterstand.
async function listeFragment(where: object, basisUrl: string, req: express.Request, user: Nutzer | null, fachCode: string): Promise<string> {
  const f = leseFilter(req)
  const offset = Math.max(0, Number(req.query.offset) || 0)
  let leicht = await ladeLeicht(where)
  // Volltext-Eingrenzung vor Chips und Karten — die Filterleiste zählt im Suchkontext mit
  if (f.q) {
    const treffer = await ftsIds(f.q)
    leicht = leicht.filter((m) => treffer.has(m.id))
  }
  const gefiltert = leicht
    .filter((m) => passtAusser(m, f, null))
    .sort((a, b) => sortScore(b) - sortScore(a) || b.id - a.id)
  const slice = gefiltert.slice(offset, offset + SEITE)
  const karten = await ladeMaterialKarten({ id: { in: slice.map((s) => s.id) } }, user?.id ?? null, fachCode)
  const nachId = new Map(karten.map((k) => [k.id, k]))
  const kartenHtml = slice
    .map((s) => nachId.get(s.id))
    .filter((k): k is MaterialKarte => !!k)
    .map((k) => materialKarte(k, !!user, user?.istAdmin ?? false))
    .join('\n')
  let sentinel = ''
  if (offset + SEITE < gefiltert.length) {
    const qs = new URLSearchParams()
    f.quellen.forEach((v) => qs.append('quelle', v))
    f.tags.forEach((v) => qs.append('tag', v))
    f.format.forEach((v) => qs.append('fmt', v))
    if (f.q) qs.set('q', f.q)
    qs.set('offset', String(offset + SEITE))
    sentinel = `<div class="sentinel" hx-get="${esc(basisUrl + (basisUrl.includes('?') ? '&' : '?') + qs.toString())}" hx-trigger="revealed" hx-swap="outerHTML"></div>`
  }
  if (offset > 0) return kartenHtml + sentinel
  const leiste = filterLeiste(...(await filterDaten(user?.id ?? null, leicht, f)), !!user)
  const inhalt = gefiltert.length
    ? kartenHtml
    : leicht.length
      ? '<p>Keine Treffer mit diesen Filtern.</p>'
      : '<p>Noch keine Materialien. <a href="/melden">Quelle melden?</a></p>'
  return leiste + inhalt + sentinel
}

// HTML-404 mit Layout statt Plaintext — kein toter Endpunkt für Besucher:innen und Crawler
async function nichtGefunden(req: express.Request, res: express.Response, was: string, user: Nutzer | null) {
  const side = await baueSidebar(await aktiverLehrplan(req), undefined, user)
  res.status(404).send(layout('Nicht gefunden', side, `<h1>${esc(was)} nicht gefunden</h1>
<p>Vielleicht hilft die <a href="/">Startseite</a> oder die <a href="/suche">Suche</a>.</p>`, user, { robots: 'noindex' }))
}

const SICHTBAR = { fehlCounter: { lt: 3 }, versteckt: false, qualityScore: { gte: 20 }, quelle: { todesCounter: { lt: 3 } } } as const

// Materialien eines Fachs: mindestens eine Zuordnung in einem seiner Lehrpläne
const inFach = (code: string) => ({ zuordnungen: { some: { teilgebiet: { lerngebiet: { lehrplan: { fach: { code } } } } } } })
const RLP_URL = 'https://edudoc.ch/record/232281/files/Rahmenlehrplan-maturitatsschulen.pdf'

// Materialien eines Lehrplans
const inLehrplan = (code: string) => ({ zuordnungen: { some: { teilgebiet: { lerngebiet: { lehrplan: { code } } } } } })

// Startseite: Landingpage für «Unterrichtsmaterial Gymnasium» — echter Inhalt statt Redirect
app.get('/', async (req, res) => {
  const user = await aktuellerUser(req)
  const side = await baueSidebar(await aktiverLehrplan(req), undefined, user)
  const [materialien, quellen, faecher] = await Promise.all([
    prisma.material.count({ where: SICHTBAR }),
    prisma.quelle.count({ where: { todesCounter: { lt: 3 }, materialien: { some: { qualityScore: { gte: 20 }, versteckt: false, fehlCounter: { lt: 3 } } } } }),
    prisma.fach.findMany({ orderBy: { name: 'asc' }, include: { lehrplaene: { orderBy: { id: 'asc' }, include: { lerngebiete: { orderBy: { nummer: 'asc' }, include: { teilgebiete: { orderBy: { code: 'asc' } } } } } } } }),
  ])
  const body = `<h1>Unterrichtsmaterial für Schweizer Gymnasien</h1>
<p>Atlas sammelt frei zugängliches Unterrichtsmaterial von Lehrpersonen für Maturitätsschulen und ordnet es den Lernzielen des <a href="https://edudoc.ch/record/232281/files/Rahmenlehrplan-maturitatsschulen.pdf" rel="noopener">Rahmenlehrplans Maturitätsschulen (EDK 2024)</a> zu — mit Kurzzusammenfassung, Link zur Originalquelle und Bewertungen aus der Community.</p>
<p>Atlas ist im Aufbau: Als Pilot deckt es die Grundlagenfächer Informatik, Physik und Mathematik ab — weitere Fächer folgen.</p>
<p class="meta">${materialien} Materialien aus ${quellen} Quellen · kostenlos und ohne Registrierung durchsuchbar</p>
<form class="suche" action="/suche"><input type="search" name="q" placeholder="Volltextsuche, z.B. binärsystem arbeitsblatt"><button>Suchen</button></form>
<h2>Fächer und Lehrpläne</h2>
${faecher.map((f) => `<div class="karte">
<h3>${esc(f.name)}</h3>
${f.lehrplaene.map((lp) => `<p class="meta"><strong><a href="/lehrplan/${esc(lp.code)}">${esc(lp.name)}</a></strong></p>
<p class="meta">${lp.lerngebiete.map((lg) => `${lg.nummer}. ${esc(lg.name)}: ${lg.teilgebiete.map((tg) => `<a href="${tgPfad(lp.code, tg.code, tg.name)}">${esc(tg.name)}</a>`).join(' · ')}`).join('<br>')}</p>`).join('')}
</div>`).join('\n')}<h2>So funktioniert Atlas</h2>
<ol>
<li><strong>Melden:</strong> Du meldest nur einen Link auf eine öffentliche Quelle — eine Material-Website, ein Git-Repo oder einen Cloud-Ordner. Sie muss nicht von dir sein.</li>
<li><strong>Sammeln:</strong> Atlas liest die Quelle automatisch aus und hält sie aktuell. Gespeichert werden Links, keine Kopien.</li>
<li><strong>Einordnen:</strong> Jedes Material wird den Lernzielen des Lehrplans zugeordnet, zusammengefasst und getaggt — die Community bewertet per Upvote.</li>
</ol>
<p><a href="/melden">Quelle melden</a> · <a href="/quellen">Alle Quellen ansehen</a></p>`
  res.send(layout('Atlas – Unterrichtsmaterial für Schweizer Gymnasien', side, body, user, {
    vollTitel: true,
    pfad: '/',
    beschreibung: `Frei zugängliches Unterrichtsmaterial für Schweizer Gymnasien, geordnet nach den Lernzielen des Rahmenlehrplans Maturitätsschulen (EDK 2024). ${materialien} Materialien aus öffentlichen Quellen, von der Community gemeldet und bewertet.`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Atlas',
      url: BASE_URL,
      description: 'Unterrichtsmaterial für Schweizer Gymnasien, geordnet nach dem Rahmenlehrplan Maturitätsschulen (EDK 2024).',
      inLanguage: 'de-CH',
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${BASE_URL}/suche?q={suchbegriff}` },
        'query-input': 'required name=suchbegriff',
      },
    },
  }))
})

// robots.txt + sitemap.xml — /suche (beliebige Query-Params) und interne Pfade vom Crawlen ausnehmen
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(`User-agent: *
Disallow: /suche
Disallow: /melden
Disallow: /login
Disallow: /admin
Disallow: /quelle/
Disallow: /auth/
Sitemap: ${BASE_URL}/sitemap.xml
`)
})

app.get('/sitemap.xml', async (_req, res) => {
  const faecher = await prisma.fach.findMany({
    include: { lehrplaene: { include: { lerngebiete: { include: { teilgebiete: { include: { kompetenzen: true } } } } } } },
  })
  const pfade = ['/', '/quellen', '/sortierung']
  for (const f of faecher) {
    for (const lp of f.lehrplaene) {
      pfade.push(`/lehrplan/${lp.code}`)
      for (const lg of lp.lerngebiete)
        for (const tg of lg.teilgebiete) {
          pfade.push(tgPfad(lp.code, tg.code, tg.name))
          for (const ko of tg.kompetenzen) pfade.push(koPfad(lp.code, ko.code, ko.text))
        }
    }
  }
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pfade.map((p) => `<url><loc>${esc(BASE_URL + p)}</loc></url>`).join('\n')}
</urlset>
`)
})

// /fach/<fach> (Startseite, alte Links) → erster Lehrplan des Fachs; /fach/<lehrplan> (alte URLs) → Lehrplan
app.get('/fach/:fach', async (req, res) => {
  const user = await aktuellerUser(req)
  const lp =
    (await prisma.lehrplan.findFirst({ where: { fach: { code: req.params.fach } }, orderBy: { id: 'asc' } })) ??
    (await prisma.lehrplan.findUnique({ where: { code: req.params.fach } }))
  if (!lp) return nichtGefunden(req, res, 'Fach', user)
  res.redirect(301, `/lehrplan/${lp.code}`)
})

// Lehrplan-Übersicht: alle Materialien des Lehrplans
app.get('/lehrplan/:lp', async (req, res) => {
  const user = await aktuellerUser(req)
  const lp = await prisma.lehrplan.findUnique({ where: { code: req.params.lp }, include: { fach: true } })
  if (!lp) return nichtGefunden(req, res, 'Lehrplan', user)
  merkeLehrplan(res, lp.code)
  const side = await baueSidebar(lp.code, undefined, user)
  const basis = `/lehrplan/${lp.code}/liste`
  const [anzahl, liste] = await Promise.all([
    prisma.material.count({ where: { ...SICHTBAR, ...inLehrplan(lp.code) } }),
    listeFragment(inLehrplan(lp.code), basis, req, user, lp.fach.code),
  ])
  const titel = lehrplanLabel(lp)
  const body = `<h1>${esc(titel)}</h1>
<p>Materialien geordnet nach dem <a href="${esc(lp.url ?? RLP_URL)}" rel="noopener">Lehrplan</a>.
Links ein Teilgebiet oder eine Kompetenz wählen — oder direkt suchen.</p>
<form class="suche" onsubmit="ladeListe();return false"><input type="search" id="suchfeld" oninput="sucheTipp()" value="${esc(String(req.query.q ?? ''))}" placeholder="Volltextsuche, z.B. binärsystem arbeitsblatt"><button>Suchen</button></form>
<h2>Alle Materialien (${anzahl})</h2>
<div id="materialliste" data-liste="${esc(basis)}">${liste}</div>`
  res.send(layout(`Unterrichtsmaterial ${titel} – Gymnasium`, side, body, user, {
    pfad: `/lehrplan/${lp.code}`,
    beschreibung: `${anzahl} Unterrichtsmaterialien für ${lp.fach.name} (${lp.name}) am Gymnasium, geordnet nach Lernzielen. Kostenlos, mit Links zu den Originalquellen.`,
  }))
})

// Alte Teilgebiet-/Lernziel-URLs hingen am Lehrplan-Code unter /fach/ — dauerhaft umleiten
app.get(['/fach/:lp/t/:code', '/fach/:lp/k/:code'], (req, res) => {
  res.redirect(301, req.originalUrl.replace(/^\/fach\//, '/lehrplan/'))
})

// HTMX-Fragment innerhalb eines Lehrplans: ?t= (Teilgebiet-Code) oder ?k= (Kompetenz-Code)
app.get('/lehrplan/:lp/liste', async (req, res) => {
  const user = await aktuellerUser(req)
  const lp = await prisma.lehrplan.findUnique({ where: { code: req.params.lp }, include: { fach: true } })
  if (!lp) return res.status(404).send('Lehrplan nicht gefunden')
  const t = String(req.query.t ?? '')
  const k = String(req.query.k ?? '')
  let where: object
  let kontext: string
  if (k) {
    const ko = await prisma.kompetenz.findFirst({ where: { code: k, teilgebiet: { lerngebiet: { lehrplanId: lp.id } } } })
    if (!ko) return res.status(404).send('Lernziel nicht gefunden')
    where = { zuordnungen: { some: { kompetenzId: ko.id } } }
    kontext = `?k=${encodeURIComponent(k)}`
  } else if (t) {
    const tg = await prisma.teilgebiet.findFirst({ where: { code: t, lerngebiet: { lehrplanId: lp.id } } })
    if (!tg) return res.status(404).send('Teilgebiet nicht gefunden')
    where = { zuordnungen: { some: { teilgebietId: tg.id } } }
    kontext = `?t=${encodeURIComponent(t)}`
  } else {
    where = { zuordnungen: { some: { teilgebiet: { lerngebiet: { lehrplanId: lp.id } } } } }
    kontext = ''
  }
  res.send(await listeFragment(where, `/lehrplan/${lp.code}/liste${kontext}`, req, user, lp.fach.code))
})

// Teilgebiet: Materialien des Teilgebiets inkl. seiner Kompetenzen.
// URL-Param ist "1.2" oder "1.2-slug…" — Code steht vor dem ersten Bindestrich;
// alles andere als der kanonische Slug-Pfad wird 301-umgeleitet (eine URL pro Seite).
app.get('/lehrplan/:lp/t/:code', async (req, res) => {
  const user = await aktuellerUser(req)
  const code = req.params.code.split('-')[0]
  const tg = await prisma.teilgebiet.findFirst({
    where: { code, lerngebiet: { lehrplan: { code: req.params.lp } } },
    include: { lerngebiet: { include: { lehrplan: { include: { fach: true } } } }, kompetenzen: { orderBy: { code: 'asc' } } },
  })
  if (!tg) return nichtGefunden(req, res, 'Teilgebiet', user)
  const lp = tg.lerngebiet.lehrplan
  merkeLehrplan(res, lp.code)
  const fachKurz = lp.fach.name
  const kanonisch = tgPfad(lp.code, tg.code, tg.name)
  if (req.path !== kanonisch) return res.redirect(301, kanonisch)
  const side = await baueSidebar(lp.code, `T${tg.code}`, user)
  const where = { zuordnungen: { some: { teilgebietId: tg.id } } }
  const basis = `/lehrplan/${lp.code}/liste?t=${encodeURIComponent(tg.code)}`
  const [anzahl, liste] = await Promise.all([
    prisma.material.count({ where: { ...where, ...SICHTBAR } }),
    listeFragment(where, basis, req, user, lp.fach.code),
  ])
  const body = `<h1>${esc(tg.code)} ${esc(tg.name)} – Unterrichtsmaterial</h1>
<p class="meta">${tg.lerngebiet.nummer}. ${esc(tg.lerngebiet.name)}</p>
<ul class="meta">${tg.kompetenzen.map((k) => `<li><a href="${koPfad(lp.code, k.code, k.text)}">${esc(k.text)}</a></li>`).join('')}</ul>
<form class="suche" onsubmit="ladeListe();return false"><input type="search" id="suchfeld" oninput="sucheTipp()" value="${esc(String(req.query.q ?? ''))}" placeholder="Volltextsuche in diesem Teilgebiet"><button>Suchen</button></form>
<div id="materialliste" data-liste="${esc(basis)}">${liste}</div>`
  res.send(layout(`Unterrichtsmaterial ${tg.name} – ${fachKurz} Gymnasium`, side, body, user, {
    pfad: kanonisch,
    beschreibung: `${anzahl} Unterrichtsmaterialien zu ${tg.name} (${tg.code}) für ${fachKurz} am Gymnasium — mit Zusammenfassungen und Links zu den Originalquellen.`,
  }))
})

// Einzelne Kompetenz — Lernziel-Seite, die wichtigste SEO-Landingpage (siehe Teilgebiet-Route zum Slug-Schema)
app.get('/lehrplan/:lp/k/:code', async (req, res) => {
  const user = await aktuellerUser(req)
  const code = req.params.code.split('-')[0]
  const ko = await prisma.kompetenz.findFirst({
    where: { code, teilgebiet: { lerngebiet: { lehrplan: { code: req.params.lp } } } },
    include: { teilgebiet: { include: { lerngebiet: { include: { lehrplan: { include: { fach: true } } } } } } },
  })
  if (!ko) return nichtGefunden(req, res, 'Lernziel', user)
  const lp = ko.teilgebiet.lerngebiet.lehrplan
  merkeLehrplan(res, lp.code)
  const kanonisch = koPfad(lp.code, ko.code, ko.text)
  if (req.path !== kanonisch) return res.redirect(301, kanonisch)
  const fachKurz = lp.fach.name
  const side = await baueSidebar(lp.code, `K${ko.code}`, user)
  const where = { zuordnungen: { some: { kompetenzId: ko.id } } }
  const basis = `/lehrplan/${lp.code}/liste?k=${encodeURIComponent(ko.code)}`
  const [anzahl, liste] = await Promise.all([
    prisma.material.count({ where: { ...where, ...SICHTBAR } }),
    listeFragment(where, basis, req, user, lp.fach.code),
  ])
  const body = `<h1>${esc(ko.code)} ${esc(grossErst(ko.text))}</h1>
<p>Unterrichtsmaterial zum Lernziel: Die Maturandinnen und Maturanden können <strong>${esc(ko.text)}</strong>.</p>
<p class="meta"><a href="${tgPfad(lp.code, ko.teilgebiet.code, ko.teilgebiet.name)}">${esc(ko.teilgebiet.code)} ${esc(ko.teilgebiet.name)}</a> · ${ko.teilgebiet.lerngebiet.nummer}. ${esc(ko.teilgebiet.lerngebiet.name)}</p>
<form class="suche" onsubmit="ladeListe();return false"><input type="search" id="suchfeld" oninput="sucheTipp()" value="${esc(String(req.query.q ?? ''))}" placeholder="Volltextsuche in diesem Lernziel"><button>Suchen</button></form>
<div id="materialliste" data-liste="${esc(basis)}">${liste}</div>`
  res.send(layout(`Unterrichtsmaterial: ${grossErst(kürze(ko.text, 60))} – ${fachKurz} Gymnasium`, side, body, user, {
    pfad: kanonisch,
    beschreibung: `${anzahl} Unterrichtsmaterialien zum Lernziel ${ko.code} (${fachKurz}, Gymnasium): ${kürze(grossErst(ko.text), 110).replace(/…?$/, (e) => e || '.')} Mit Zusammenfassungen, Tags und Links zu den Originalquellen.`,
  }))
})

// Volltextsuche (FTS5) und Tag-Filter
app.get('/suche', async (req, res) => {
  const user = await aktuellerUser(req)
  const q = String(req.query.q ?? '').trim()
  const tag = String(req.query.tag ?? '').trim()
  // Fach-Kontext (von Fach-Seiten mitgegeben): Resultate aufs Fach einschränken
  const fachParam = String(req.query.fach ?? '').trim()
  const suchFach = fachParam ? await prisma.fach.findUnique({ where: { code: fachParam } }) : null
  const fachFilter = suchFach ? inFach(suchFach.code) : {}
  // Bereichs-Kontext (Lehrplan + Teilgebiet/Lernziel): Suche nur innerhalb dieser Zuordnung
  const lpParam = String(req.query.lp ?? '').trim()
  const tParam = String(req.query.t ?? '').trim()
  const kParam = String(req.query.k ?? '').trim()
  const suchLp = lpParam ? await prisma.lehrplan.findUnique({ where: { code: lpParam }, include: { fach: true } }) : null
  const lpCode = suchLp?.code ?? (await aktiverLehrplan(req))
  const fachCode = suchFach?.code ?? suchLp?.fach.code ?? (await prisma.lehrplan.findUnique({ where: { code: lpCode }, include: { fach: true } }))?.fach.code ?? ''

  let bereich: { label: string; hidden: string } | null = null
  let bereichFilter: object = {}
  const lpHidden = suchLp ? `<input type="hidden" name="lp" value="${esc(suchLp.code)}">` : ''
  if (suchLp && kParam) {
    const ko = await prisma.kompetenz.findFirst({ where: { code: kParam, teilgebiet: { lerngebiet: { lehrplanId: suchLp.id } } } })
    if (ko) {
      bereichFilter = { zuordnungen: { some: { kompetenzId: ko.id } } }
      bereich = { label: `${ko.code} ${grossErst(kürze(ko.text, 70))}`, hidden: `${lpHidden}<input type="hidden" name="k" value="${esc(ko.code)}">` }
    }
  } else if (suchLp && tParam) {
    const tg = await prisma.teilgebiet.findFirst({ where: { code: tParam, lerngebiet: { lehrplanId: suchLp.id } } })
    if (tg) {
      bereichFilter = { zuordnungen: { some: { teilgebietId: tg.id } } }
      bereich = { label: `${tg.code} ${tg.name}`, hidden: `${lpHidden}<input type="hidden" name="t" value="${esc(tg.code)}">` }
    }
  }
  let karten: MaterialKarte[] = []
  if (tag) {
    karten = await ladeMaterialKarten({ tags: { some: { tag: { name: tag } } }, ...fachFilter, ...bereichFilter }, user?.id ?? null, fachCode)
  } else if (q) {
    // Suchwörter, die auf eine Quelle passen ("oinf.ch simulation"), werden zum Quellen-Filter;
    // der Rest geht in die FTS5-Volltextsuche.
    const quellRows = await prisma.quelle.findMany({ where: { todesCounter: { lt: 3 } }, select: { url: true } })
    const gruppen = [...new Set(quellRows.map((x) => quellenKey(x.url)))]
    const quellTreffer: string[] = []
    const textWoerter: string[] = []
    for (const wort of q.split(/\s+/)) {
      const g = gruppen.find((x) => x.toLowerCase().includes(wort.toLowerCase()))
      if (g && wort.length >= 4) quellTreffer.push(g)
      else textWoerter.push(wort)
    }
    const quellFilter = quellTreffer.length
      ? { OR: quellTreffer.map((g) => ({ url: { contains: g } })) }
      : {}
    if (textWoerter.length) {
      const ftsQuery = ftsAnfrage(textWoerter)
      const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `SELECT rowid AS id FROM material_fts WHERE material_fts MATCH ? ORDER BY rank LIMIT 100`,
        ftsQuery
      )
      karten = await ladeMaterialKarten({ id: { in: rows.map((r) => Number(r.id)) }, ...quellFilter, ...fachFilter, ...bereichFilter }, user?.id ?? null, fachCode)
    } else {
      karten = await ladeMaterialKarten({ ...quellFilter, ...fachFilter, ...bereichFilter }, user?.id ?? null, fachCode)
    }
  }
  const side = await baueSidebar(lpCode, bereich && kParam ? `K${kParam}` : bereich && tParam ? `T${tParam}` : undefined, user)
  const body = `<h1>Suche${suchFach ? ` – ${esc(suchFach.name)}` : ''}</h1>
${bereich ? `<p class="meta">Eingeschränkt auf ${esc(bereich.label)}</p>` : ''}
<form class="suche">${suchFach ? `<input type="hidden" name="fach" value="${esc(suchFach.code)}">` : ''}${bereich?.hidden ?? ''}<input type="search" name="q" value="${esc(q)}" placeholder="Volltextsuche"><button>Suchen</button></form>
${tag ? `<h2>Tag: ${esc(tag)}</h2>` : q ? `<h2>Resultate für «${esc(q)}»</h2>` : ''}
${(q || tag) ? (karten.length ? karten.map((k) => materialKarte(k, !!user, user?.istAdmin ?? false)).join('\n') : '<p>Keine Treffer.</p>') : ''}`
  res.send(layout('Suche', side, body, user, { robots: 'noindex,follow' }))
})

// Melden: nur mit Login (Kostenbremse) — Quelle wird sofort gecrawlt, damit man das Resultat sieht
app.get('/melden', async (req, res) => {
  const user = await aktuellerUser(req)
  const lpCode = await aktiverLehrplan(req)
  const aktivesFach = (await prisma.lehrplan.findUnique({ where: { code: lpCode }, include: { fach: true } }))?.fach.code ?? ''
  const vorausgewaehlt = String(req.query.fach ?? aktivesFach)
  if (!user) return res.redirect(`/login?weiter=${encodeURIComponent(`/melden?fach=${vorausgewaehlt}`)}`)
  const faecher = await prisma.fach.findMany({ select: { code: true, name: true } })
  const side = await baueSidebar(lpCode, undefined, user)
  const body = `<h1>Quelle melden</h1>
<p>Nur ein Link — den Rest macht Atlas (Crawling, Zuordnung zum Lehrplan, Zusammenfassung).</p>
<form method="post">
  <p><input type="url" name="url" required placeholder="https://…" style="width:100%"></p>
  <p><select name="fach"><option value="">Fach (optional)</option>${faecher.map((f) => `<option value="${esc(f.code)}"${f.code === vorausgewaehlt ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select></p>
  <p><button>Melden</button></p>
</form>
<h2>Was kann gemeldet werden?</h2>
<div class="karte">
  <h3>Websites</h3>
  <p style="margin:.2rem 0">Eine öffentliche Material-Website oder ein einzelner Kurs darauf. Atlas findet die Unterseiten selbst (Sitemap oder Links) und hält sie aktuell.</p>
  <p class="meta">Beispiel: <code>https://oinf.ch/</code></p>
</div>
<div class="karte">
  <h3>Git-Repositories</h3>
  <p style="margin:.2rem 0">Öffentliche Repos von GitHub, GitLab oder Codeberg — z.B. ein Skript als Markdown oder LaTeX. Bitte einzelne Repos melden, nicht die Profilseite.</p>
  <p class="meta">Beispiel: <code>https://github.com/pro-kswe/netzwerke</code></p>
</div>
<div class="karte">
  <h3>Cloud-Ordner</h3>
  <p style="margin:.2rem 0">Freigegebene Ordner aus OneDrive/SharePoint (auch Schul-Konten), Dropbox oder Nextcloud — Atlas liest die Dateien darin (PDF, Word, PowerPoint, Markdown, …; Videos nur nach Dateiname). Im Ordner: <em>Teilen</em> → «Jeder mit dem Link kann anzeigen» → Link kopieren und hier einfügen. Google Drive wird noch nicht unterstützt.</p>
  <p class="meta">Beispiel: <code>https://1drv.ms/f/…</code></p>
</div>`
  res.send(layout('Quelle melden', side, body, user))
})

const MELDE_LIMIT = Number(process.env.MELDE_LIMIT ?? 20) // Quellen pro Konto und 24h — Kostenbremse; 0 = aus

app.post('/melden', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!user) return res.redirect('/login')
  const side = await baueSidebar(await aktiverLehrplan(req), undefined, user)
  const gemeldet24h = await prisma.quelle.count({
    where: { melderId: user.id, createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
  })
  if (MELDE_LIMIT > 0 && gemeldet24h >= MELDE_LIMIT) {
    return res.status(429).send(layout('Limit erreicht', side, `<h1>Tageslimit erreicht</h1>
<p>Du hast in den letzten 24 Stunden ${MELDE_LIMIT} Quellen gemeldet — mehr geht pro Tag nicht (jede Quelle erzeugt dauerhafte Crawl- und AI-Last). Morgen geht's weiter; wenn du wirklich mehr brauchst, melde dich bei uns.</p>`, user))
  }
  let url: string
  try {
    url = normalizeUrl(String(req.body.url))
    await pruefeOeffentlich(url)
  } catch {
    return res.send(layout('Fehler', side, '<p>Ungültige oder nicht erlaubte URL.</p><p><a href="/melden">Zurück</a></p>', user))
  }
  // Git-Profilseiten (github.com/user ohne Repo) blocken — wir crawlen bewusst nur gemeldete Repos.
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const segmente = u.pathname.split('/').filter(Boolean)
    if (host === 'drive.google.com') {
      return res.send(layout('Noch nicht unterstützt', side, `<h1>Google Drive noch nicht unterstützt</h1>
<p>Google Drive erlaubt keinen anonymen Ordner-Download — wir arbeiten daran. Unterstützt sind OneDrive, Dropbox und Nextcloud-Freigabelinks.</p>
<p><a href="/melden">Zurück</a></p>`, user))
    }
    if (['github.com', 'gitlab.com', 'codeberg.org'].includes(host) && segmente.length < 2) {
      return res.send(layout('Bitte einzelne Repos melden', side, `<h1>Bitte einzelne Repos melden</h1>
<p>Das ist eine Profilseite (<code>${esc(host)}/${esc(segmente[0] ?? '')}</code>). Atlas fügt bewusst nicht automatisch alle Repos einer Person hinzu — melde stattdessen die einzelnen Repos, die Unterrichtsmaterial enthalten (z.B. <code>${esc(host)}/${esc(segmente[0] ?? 'user')}/mein-skript</code>).</p>
<p><a href="/melden">Zurück</a></p>`, user))
    }
  } catch { /* normalizeUrl hat schon validiert */ }
  const existiert = await prisma.quelle.findUnique({ where: { url } })
  if (existiert) {
    return res.send(layout('Schon vorhanden', side, `<p>Diese Quelle ist schon gemeldet${existiert.titel ? `: <strong>${esc(existiert.titel)}</strong>` : ''}.</p><p><a href="/">Zur Übersicht</a></p>`, user))
  }
  await prisma.quellenSperre.deleteMany({ where: { url } }) // manuelles Melden hebt die Sync-Sperre auf
  const quelle = await prisma.quelle.create({
    data: { url, typ: erkenneTyp(url), fach: String(req.body.fach || '') || null, melderId: user.id },
  })
  if (MELDE_LIMIT > 0 && gemeldet24h + 1 === MELDE_LIMIT) {
    // Genau beim Erreichen des Limits: Admin informieren (einmalig pro Schub)
    const voll = await prisma.user.findUnique({ where: { id: user.id } })
    sendeMail(
      'marc@informatikgarten.ch',
      'Atlas: Melde-Limit erreicht',
      `<p>${esc(user.nickname)} (${esc(voll?.email ?? '?')}) hat soeben das Tageslimit von ${MELDE_LIMIT} gemeldeten Quellen erreicht.</p><p><a href="https://atlas.eduskript.org/quellen">Quellen ansehen</a></p>`,
      'atlas-rate-limit'
    ).catch((e) => console.error('Rate-Limit-Mail fehlgeschlagen:', e))
  }
  // Crawl im Hintergrund; die Status-Seite pollt den Fortschritt
  crawlLaeufe.set(quelle.id, { fertig: false, start: Date.now() })
  crawlQuelle(quelle.id)
    .then((r) => crawlLaeufe.set(quelle.id, { fertig: true, resultat: r, start: Date.now() }))
    .catch((e) => crawlLaeufe.set(quelle.id, { fertig: true, resultat: `Fehler: ${(e as Error).message}`, start: Date.now() }))
  res.redirect(`/quelle/${quelle.id}/status`)
})

// Laufende Melde-Crawls (in-memory; nach Neustart zeigt die Status-Seite den DB-Stand)
const crawlLaeufe = new Map<number, { fertig: boolean; resultat?: string; start: number }>()

async function crawlStatusFragment(quelleId: number): Promise<string> {
  const lauf = crawlLaeufe.get(quelleId)
  const anzahl = await prisma.material.count({ where: { quelleId, qualityScore: { gte: 20 } } })
  if (lauf && !lauf.fertig) {
    const sek = Math.round((Date.now() - lauf.start) / 1000)
    return `<div id="crawl-status" hx-get="/quelle/${quelleId}/status/fragment" hx-trigger="every 2s" hx-swap="outerHTML">
<p>⏳ Atlas crawlt die Quelle … <strong>${anzahl}</strong> Materialien bisher (${sek}s)</p>
<p class="meta">Du kannst dieses Fenster schliessen — der Crawl läuft auf dem Server weiter.</p>
</div>`
  }
  const quelle = await prisma.quelle.findUnique({ where: { id: quelleId } })
  return `<div id="crawl-status">
<p>✅ Fertig: <strong>${anzahl}</strong> Materialien aufgenommen${lauf?.resultat ? ` <span class="meta">(${esc(lauf.resultat)})</span>` : ''}</p>
${lauf?.resultat?.startsWith('Fehler: Bot-Sperre')
    ? '<p class="hinweis">Diese Website blockiert automatisierte Zugriffe (z.B. Cloudflare-Prüfung «Just a moment…»). Atlas kann sie nicht lesen — nur die Betreiber können den Bot freischalten.</p>'
    : quelle && quelle.todesCounter > 0 ? '<p class="hinweis">Die Quelle war nicht erreichbar — bitte URL prüfen.</p>' : ''}
<p><a href="/">Zur Übersicht</a> · <a href="/quellen">Alle Quellen</a></p>
</div>`
}

app.get('/quelle/:id/status', async (req, res) => {
  const user = await aktuellerUser(req)
  const side = await baueSidebar(await aktiverLehrplan(req), undefined, user)
  const quelle = await prisma.quelle.findUnique({ where: { id: Number(req.params.id) } })
  if (!quelle) return nichtGefunden(req, res, 'Quelle', user)
  const body = `<h1>Quelle gemeldet</h1>
<p><code>${esc(quelle.url)}</code></p>
${await crawlStatusFragment(quelle.id)}`
  res.send(layout('Quelle gemeldet', side, body, user))
})

app.get('/quelle/:id/status/fragment', async (req, res) => {
  res.send(await crawlStatusFragment(Number(req.params.id)))
})

async function quellenListe(user: Nutzer | null): Promise<string> {
  const quellen = await prisma.quelle.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      melder: true,
      _count: { select: { materialien: { where: { qualityScore: { gte: 20 }, versteckt: false, fehlCounter: { lt: 3 } } } } },
    },
  })
  const gruppiere = (liste: typeof quellen) => {
    const gruppen = new Map<string, typeof quellen>()
    for (const q of liste) {
      let key: string
      try {
        const u = new URL(q.url)
        const host = u.hostname.replace(/^www\./, '')
        key = ['github.com', 'gitlab.com', 'codeberg.org', 'eduskript.org'].includes(host) ? `${host}/${u.pathname.split('/')[1] ?? ''}` : host
      } catch { key = q.url }
      if (!gruppen.has(key)) gruppen.set(key, [])
      gruppen.get(key)!.push(q)
    }
    return gruppen
  }
  // Quellen ohne sichtbare Materialien (leer/abgelehnt/tot) wandern in einen zugeklappten Bereich am Schluss
  const istAktiv = (q: (typeof quellen)[0]) => q._count.materialien > 0 && q.todesCounter < 3
  const gruppen = gruppiere(quellen.filter(istAktiv))
  const leer = quellen.filter((q) => !istAktiv(q))
  const leerGruppen = gruppiere(leer)
  const muell = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
  const zeile = (q: (typeof quellen)[0]) =>
    `<tr><td><a href="${esc(q.url)}" rel="noopener">${esc(kürze(q.titel ?? q.url, 60))}</a></td><td>${esc(q.typ)}</td><td>${q.qualityScore ?? '–'}</td><td>${q.todesCounter}</td><td>${q._count.materialien}</td><td>${esc(q.melder.nickname)}</td>${
      user && (user.istAdmin || q.melderId === user.id)
        ? `<td><form hx-post="/quelle/${q.id}/loeschen" hx-target="#quellen-liste" hx-swap="outerHTML" hx-confirm="Quelle samt ${q._count.materialien} Materialien und Votes löschen?"><button class="btn-loeschen" title="Quelle löschen">${muell}</button></form></td>`
        : ''
    }</tr>`
  const gruppeHtml = ([key, qs]: [string, typeof quellen]) => {
    const mats = qs.reduce((s, q) => s + q._count.materialien, 0)
    return `<details ${qs.length === 1 ? '' : 'open'} style="margin-bottom:.6rem">
<summary style="cursor:pointer;padding:.3rem 0"><strong>${esc(key)}</strong> <span class="meta">${qs.length} ${qs.length === 1 ? 'Quelle' : 'Quellen'} · ${mats} Materialien</span></summary>
<table><tr><th>URL</th><th>Typ</th><th>Score</th><th>☠</th><th>Materialien</th><th>Melder:in</th>${user ? '<th></th>' : ''}</tr>
${qs.map(zeile).join('\n')}</table>
</details>`
  }
  return `<div id="quellen-liste">
${[...gruppen.entries()].map(gruppeHtml).join('\n')}
${leer.length ? `<details style="margin-top:1.2rem">
<summary style="cursor:pointer;padding:.3rem 0" class="meta">Ausgeblendete Quellen ohne Inhalte (${leer.length})</summary>
${[...leerGruppen.entries()].map(gruppeHtml).join('\n')}
</details>` : ''}
</div>`
}

app.get('/quellen', async (req, res) => {
  const user = await aktuellerUser(req)
  const side = await baueSidebar(await aktiverLehrplan(req), undefined, user)
  const body = `<h1>Quellen</h1>
${await quellenListe(user)}`
  res.send(layout('Quellen', side, body, user, { pfad: '/quellen', beschreibung: 'Alle Quellen, aus denen Atlas Unterrichtsmaterial für Schweizer Gymnasien sammelt — Websites, Git-Repos und Cloud-Ordner von Lehrpersonen.' }))
})

// Transparenz: Ranking-Formel, Bänder und der wörtliche Bewertungs-Prompt
app.get('/sortierung', async (req, res) => {
  const user = await aktuellerUser(req)
  const side = await baueSidebar(await aktiverLehrplan(req), undefined, user)
  const body = `<h1>Wie wird sortiert?</h1>
<p>Jedes Material bekommt beim Erfassen von der AI einen <strong>AI-Score</strong> von 0 bis 100. Angemeldete Lehrpersonen stimmen ab, jede Netto-Stimme zählt 5 Punkte.
Sortiert wird nach <strong>AI-Score + 5 × Netto-Stimmen</strong>. Materialien unter 20 werden nicht aufgenommen.</p>
<h2>Die fünf Bänder</h2>
<table>
<tr><th>AI-Score</th><th>Band</th><th></th></tr>
${SCORE_BAENDER.map(([von, name, kurz], i) => `<tr><td>${von}–${(SCORE_BAENDER[i + 1]?.[0] ?? 101) - 1}</td><td>${esc(name)}</td><td class="meta">${esc(kurz)}</td></tr>`).join('\n')}
</table>
<h2>Der Prompt</h2>
<p class="meta">Wörtlich der Teil des Klassifikations-Prompts, der den AI-Score bestimmt — direkt aus dem Quelltext, damit diese Seite nie veraltet.</p>
<pre style="white-space:pre-wrap;font-size:.8rem;background:var(--card);border:1px solid var(--rand);border-radius:10px;padding:.9rem 1.1rem">${esc(SCORE_PROMPT)}</pre>
<p class="meta">Modell: Gemini Flash Lite. Der ganze Code ist offen: <a href="https://github.com/marcchehab/atlas" rel="noopener">github.com/marcchehab/atlas</a>.</p>`
  res.send(layout('Wie wird sortiert?', side, body, user, { pfad: '/sortierung', beschreibung: 'So sortiert Atlas Unterrichtsmaterial: AI-Score in fünf Bändern plus Stimmen der Community — mit dem vollständigen Bewertungs-Prompt.' }))
})

// Vote (HTMX): gleicher Pfeil nochmal = zurückziehen, anderer Pfeil = wechseln
app.post('/vote/:id/:richtung', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!user) return res.status(401).send('')
  const materialId = Number(req.params.id)
  const wert = req.params.richtung === 'down' ? -1 : 1
  const key = { userId_materialId: { userId: user.id, materialId } }
  const vorhanden = await prisma.upvote.findUnique({ where: key })
  let meinVote: number
  if (vorhanden?.wert === wert) {
    await prisma.upvote.delete({ where: key })
    meinVote = 0
  } else {
    await prisma.upvote.upsert({ where: key, create: { userId: user.id, materialId, wert }, update: { wert } })
    meinVote = wert
  }
  const agg = await prisma.upvote.aggregate({ where: { materialId }, _sum: { wert: true } })
  res.send(voteButtons({ id: materialId, score: agg._sum.wert ?? 0, meinVote }, true))
})

// Quelle löschen: Admins jede, Melder:innen ihre eigenen.
// Prisma → Materialien/Zuordnungen/Votes cascaden korrekt; Git-Klon wird mitgelöscht.
app.post('/quelle/:id/loeschen', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!user) return res.status(401).send('Nicht angemeldet')
  const id = Number(req.params.id)
  const quelle = await prisma.quelle.findUnique({ where: { id } })
  if (!quelle) return res.status(404).send('Quelle nicht gefunden')
  if (!user.istAdmin && quelle.melderId !== user.id) return res.status(403).send('Nur eigene Quellen.')
  await prisma.quelle.delete({ where: { id } })
  await prisma.quellenSperre.upsert({ where: { url: quelle.url }, create: { url: quelle.url }, update: {} }) // Sync soll sie nicht wiederbeleben
  await fs.rm(path.join(process.cwd(), 'data', 'git', String(id)), { recursive: true, force: true })
  if (req.headers['hx-request']) return res.send(await quellenListe(user))
  res.redirect('/quellen')
})

// Tag-Vorschlags-Vote (HTMX-Toggle); 3 Stimmen machen den Tag offiziell
app.post('/tagvote/:id', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!user) return res.status(401).send('')
  const tagId = Number(req.params.id)
  const tag = await prisma.tag.findUnique({ where: { id: tagId }, include: { votes: true } })
  if (!tag || tag.status !== 'VORSCHLAG') return res.status(404).send('')
  const meiner = tag.votes.find((v) => v.userId === user.id)
  if (meiner) await prisma.tagVote.delete({ where: { userId_tagId: { userId: user.id, tagId } } })
  else await prisma.tagVote.create({ data: { userId: user.id, tagId } })
  const votes = await prisma.tagVote.count({ where: { tagId } })
  if (votes >= 3) {
    await prisma.tag.update({ where: { id: tagId }, data: { status: 'AKTIV' } })
    return res.send(`<button class="qchip" data-fk="tags" data-q="${esc(tag.name)}" onclick="fltrToggle('tags','${esc(tag.name)}')">${esc(tag.name)}</button>`)
  }
  res.send(tagVorschlagChip({ id: tagId, name: tag.name, votes, meinVote: !meiner }, true))
})

// ---------- Admin ----------

// Tag-Verwaltung (Vorschläge + aktive Tags) als ein Fragment — nach Aktionen per HTMX neu gerendert,
// damit z.B. frisch freigegebene Tags sofort in der Aktiv-Tabelle auftauchen.
async function adminTagsSektion(): Promise<string> {
  const vorschlaege = await prisma.tag.findMany({ where: { status: 'VORSCHLAG' }, orderBy: { name: 'asc' }, include: { _count: { select: { votes: true } } } })
  const aktive = await prisma.tag.findMany({ where: { status: 'AKTIV' }, orderBy: { name: 'asc' }, include: { _count: { select: { material: true } } } })
  const tagAuswahl = aktive.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')
  const aktivTabelle = `<h2>Aktive Tags</h2>
<table><tr><th>Tag</th><th>Materialien</th><th></th></tr>
${aktive.map((t) => `<tr><td><input class="tag-edit" value="${esc(t.name)}" name="name" hx-post="/admin/tag/${t.id}/umbenennen" hx-trigger="change" hx-target="#tag-verwaltung" hx-swap="outerHTML" title="Umbenennen: tippen und Enter"></td><td>${t._count.material}</td><td><form hx-post="/admin/tag/${t.id}/loeschen" hx-target="#tag-verwaltung" hx-swap="outerHTML" hx-confirm="Tag löschen?"><button class="btn-loeschen" title="Tag löschen"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button></form></td></tr>`).join('\n')}</table>`
  if (!vorschlaege.length) return `<div id="tag-verwaltung"><h2>Tag-Vorschläge (0)</h2><p class="meta">Keine offenen Vorschläge.</p>${aktivTabelle}</div>`
  return `<div id="tag-verwaltung">
<h2>Tag-Vorschläge (${vorschlaege.length})</h2>
<form hx-post="/admin/tags/bulk" hx-target="#tag-verwaltung" hx-swap="outerHTML">
<p style="display:flex;gap:.5rem;align-items:center">
  <label class="meta"><input type="checkbox" onclick="document.querySelectorAll('#tag-verwaltung input[name=ids]').forEach(c=>c.checked=this.checked)"> alle</label>
  <button name="aktion" value="freigeben">Auswahl freigeben</button>
  <button name="aktion" value="loeschen" style="background:#b3261e" hx-confirm="Ausgewählte Vorschläge löschen?">Auswahl löschen</button>
</p>
<table><tr><th></th><th>Tag</th><th>Votes</th><th></th></tr>
${vorschlaege
  .map(
    (t) => `<tr><td><input type="checkbox" name="ids" value="${t.id}"></td><td><input class="tag-edit" value="${esc(t.name)}" name="name" hx-post="/admin/tag/${t.id}/umbenennen" hx-trigger="change" hx-target="#tag-verwaltung" hx-swap="outerHTML" title="Umbenennen: tippen und Enter"></td><td>${t._count.votes}/3</td><td>
<span style="display:flex;gap:.2rem;align-items:center"><select name="ziel-${t.id}">${tagAuswahl}</select><button name="aktion" value="mergen-${t.id}">Mergen</button></span>
</td></tr>`
  )
  .join('\n')}</table>
</form>
${aktivTabelle}
</div>`
}



function nurAdmin(user: Nutzer | null, res: express.Response): user is Nutzer {
  if (user?.istAdmin) return true
  res.status(403).send('Nur für Admins.')
  return false
}

app.get('/admin', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!nurAdmin(user, res)) return
  const side = await baueSidebar(await aktiverLehrplan(req), undefined, user)
  const abgelehnte = await prisma.material.findMany({ where: { qualityScore: { lt: 20 } }, orderBy: { createdAt: 'desc' }, take: 100, include: { quelle: true } })
  const versteckte = await prisma.material.findMany({ where: { versteckt: true }, orderBy: { createdAt: 'desc' } })
  const tote = await prisma.quelle.findMany({ where: { todesCounter: { gte: 3 } }, include: { melder: true } })
  const body = `<h1>Admin</h1>
${await adminTagsSektion()}
<h2>Von der AI abgelehnt (${abgelehnte.length}, Score &lt; 20)</h2>
<table><tr><th>Titel</th><th>Score</th><th>Quelle</th></tr>
${abgelehnte.map((m) => `<tr><td><a href="${esc(m.url)}" rel="noopener">${esc(kürze(m.titel, 60))}</a></td><td>${m.qualityScore}</td><td class="meta">${esc(quellenKey(m.quelle.url))}</td></tr>`).join('\n')}</table>
<h2>Versteckte Materialien (${versteckte.length})</h2>
${versteckte.length ? `<table><tr><th>Titel</th><th></th></tr>
${versteckte.map((m) => `<tr><td><a href="${esc(m.url)}" rel="noopener">${esc(kürze(m.titel, 60))}</a></td><td><form hx-post="/admin/material/${m.id}/verstecken" hx-target="closest tr" hx-swap="outerHTML"><button>Wieder zeigen</button></form></td></tr>`).join('\n')}</table>` : '<p class="meta">Keine.</p>'}
<h2>Tote Quellen (${tote.length})</h2>
${tote.length ? `<table><tr><th>URL</th><th>☠</th><th>Melder:in</th></tr>
${tote.map((q) => `<tr><td><a href="${esc(q.url)}" rel="noopener">${esc(kürze(q.titel ?? q.url, 60))}</a></td><td>${q.todesCounter}</td><td>${esc(q.melder.nickname)}</td></tr>`).join('\n')}</table>` : '<p class="meta">Keine.</p>'}`
  res.send(layout('Admin', side, body, user))
})

app.post('/admin/tags/bulk', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!nurAdmin(user, res)) return
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : req.body.ids ? [req.body.ids] : []).map(Number)
  const aktion = String(req.body.aktion ?? '')
  if (aktion === 'freigeben' && ids.length) {
    await prisma.tag.updateMany({ where: { id: { in: ids }, status: 'VORSCHLAG' }, data: { status: 'AKTIV' } })
  } else if (aktion === 'loeschen' && ids.length) {
    await prisma.materialTag.deleteMany({ where: { tagId: { in: ids } } })
    await prisma.tagVote.deleteMany({ where: { tagId: { in: ids } } })
    await prisma.tag.deleteMany({ where: { id: { in: ids }, status: 'VORSCHLAG' } })
  } else if (aktion.startsWith('mergen-')) {
    const von = Number(aktion.slice(7))
    const ziel = Number(req.body[`ziel-${von}`])
    if (von && ziel && von !== ziel) {
      const zuweisungen = await prisma.materialTag.findMany({ where: { tagId: von } })
      for (const z of zuweisungen) {
        await prisma.materialTag.upsert({
          where: { materialId_tagId: { materialId: z.materialId, tagId: ziel } },
          create: { materialId: z.materialId, tagId: ziel },
          update: {},
        })
      }
      await prisma.materialTag.deleteMany({ where: { tagId: von } })
      await prisma.tagVote.deleteMany({ where: { tagId: von } })
      await prisma.tag.delete({ where: { id: von } })
    }
  }
  res.send(await adminTagsSektion())
})

app.post('/admin/tag/:id/freigeben', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!nurAdmin(user, res)) return
  await prisma.tag.update({ where: { id: Number(req.params.id) }, data: { status: 'AKTIV' } })
  if (req.headers['hx-request']) return res.send('')
  res.redirect('/admin')
})

app.post('/admin/tag/:id/umbenennen', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!nurAdmin(user, res)) return
  const name = String(req.body.name ?? '').toLowerCase().trim()
  if (name.length >= 2 && name.length <= 30) {
    await prisma.tag.update({ where: { id: Number(req.params.id) }, data: { name } }).catch(() => {}) // Namenskonflikt → unverändert
  }
  if (req.headers['hx-request']) return res.send(await adminTagsSektion())
  res.redirect('/admin')
})

app.post('/admin/tag/:id/loeschen', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!nurAdmin(user, res)) return
  const id = Number(req.params.id)
  await prisma.materialTag.deleteMany({ where: { tagId: id } })
  await prisma.tagVote.deleteMany({ where: { tagId: id } })
  await prisma.tag.delete({ where: { id } })
  if (req.headers['hx-request']) return res.send(await adminTagsSektion())
  res.redirect('/admin')
})

app.post('/admin/tag/:id/mergen', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!nurAdmin(user, res)) return
  const von = Number(req.params.id)
  const ziel = Number(req.body.ziel)
  if (von !== ziel) {
    const zuweisungen = await prisma.materialTag.findMany({ where: { tagId: von } })
    for (const z of zuweisungen) {
      await prisma.materialTag.upsert({
        where: { materialId_tagId: { materialId: z.materialId, tagId: ziel } },
        create: { materialId: z.materialId, tagId: ziel },
        update: {},
      })
    }
    await prisma.materialTag.deleteMany({ where: { tagId: von } })
    await prisma.tag.delete({ where: { id: von } })
  }
  if (req.headers['hx-request']) return res.send('')
  res.redirect('/admin')
})

// Karte ausblenden/zeigen (Toggle); aus der Karten-Ansicht via HTMX (leere Antwort entfernt die Karte)
app.post('/admin/material/:id/verstecken', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!nurAdmin(user, res)) return
  const id = Number(req.params.id)
  const m = await prisma.material.findUniqueOrThrow({ where: { id } })
  await prisma.material.update({ where: { id }, data: { versteckt: !m.versteckt } })
  if (req.headers['hx-request']) return res.send('')
  res.redirect('/admin')
})

// ---------- Auth: Microsoft OAuth (Entra) + Magic-Link (Brevo) ----------

function loginAbschliessen(res: express.Response, userId: number, weiter: string) {
  res.cookie('uid', String(userId), { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 180 * 24 * 3600 * 1000 })
  res.redirect(weiter.startsWith('/') ? weiter : '/') // nur relative Ziele — kein Open Redirect
}

async function userFuerEmail(email: string, name?: string): Promise<number> {
  const nickname = (name ?? email.split('@')[0]).trim()
  const user = await prisma.user.upsert({ where: { email }, create: { email, nickname }, update: {} })
  return user.id
}

app.get('/login', (req, res) => {
  res.send(loginSeite({ microsoft: auth.microsoftKonfiguriert(), weiter: String(req.query.weiter ?? '/') }))
})

app.get('/auth/microsoft', (req, res) => {
  const state = auth.neuerState()
  res.cookie('oauth', JSON.stringify({ state, weiter: String(req.query.weiter ?? '/') }), {
    signed: true, httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000,
  })
  res.redirect(auth.microsoftAuthUrl(state))
})

app.get('/api/auth/callback/microsoft', async (req, res) => {
  try {
    const cookie = JSON.parse(String(req.signedCookies?.oauth ?? '{}')) as { state?: string; weiter?: string }
    if (!req.query.code || !req.query.state || req.query.state !== cookie.state || !auth.statePruefen(cookie.state ?? '')) {
      throw new Error('State ungültig')
    }
    res.clearCookie('oauth')
    const { email, name } = await auth.microsoftCallback(String(req.query.code))
    loginAbschliessen(res, await userFuerEmail(email, name), cookie.weiter ?? '/')
  } catch (e) {
    const side = await baueSidebar(await aktiverLehrplan(req), undefined, null)
    res.status(400).send(layout('Fehler', side, `<p>Anmeldung fehlgeschlagen (${esc((e as Error).message)}). <a href="/login">Nochmal versuchen</a></p>`, null))
  }
})

app.post('/auth/magic', async (req, res) => {
  const email = String(req.body.email ?? '').toLowerCase().trim()
  const side = await baueSidebar(await aktiverLehrplan(req), undefined, null)
  if (!email.includes('@')) return res.redirect('/login')
  try {
    await auth.sendeMagicLink(email)
  } catch (e) {
    return res.status(500).send(layout('Fehler', side, `<p>Mail-Versand fehlgeschlagen (${esc((e as Error).message)}). <a href="/login">Zurück</a></p>`, null))
  }
  res.send(layout('Mail unterwegs', side, `<h1>Fast geschafft</h1><p>Wir haben einen Anmelde-Link an <strong>${esc(email)}</strong> geschickt (15 Minuten gültig). Schau auch im Spam nach.</p>`, null))
})

app.get('/api/auth/magic', async (req, res) => {
  const email = auth.magicTokenPruefen(String(req.query.token ?? ''))
  if (!email) {
    const side = await baueSidebar(await aktiverLehrplan(req), undefined, null)
    return res.status(400).send(layout('Link ungültig', side, '<p>Der Link ist ungültig oder abgelaufen. <a href="/login">Neu anfordern</a></p>', null))
  }
  loginAbschliessen(res, await userFuerEmail(email), '/')
})

app.post('/profil/nickname', async (req, res) => {
  const user = await aktuellerUser(req)
  if (!user) return res.status(401).send('Nicht angemeldet')
  const nickname = String(req.body.nickname ?? '').trim()
  if (nickname.length < 2 || nickname.length > 30) return res.status(400).send('Nickname muss 2–30 Zeichen lang sein')
  await prisma.user.update({ where: { id: user.id }, data: { nickname } })
  res.send('ok')
})

app.post('/logout', (_req, res) => {
  res.clearCookie('uid')
  res.redirect('/')
})

// Unbekannte Pfade: HTML-404 statt Express-Default
app.use(async (req, res) => {
  nichtGefunden(req, res, 'Seite', await aktuellerUser(req))
})

const PORT = Number(process.env.PORT ?? 3000)
initDb().then(() => {
  app.listen(PORT, () => console.log(`Atlas läuft auf http://localhost:${PORT}`))
})
