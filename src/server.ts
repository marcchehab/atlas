import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { prisma, initDb, normalizeUrl, erkenneTyp } from './db.js'
import { crawlQuelle } from './crawler.js'
import * as auth from './auth.js'
import { layout, esc, kürze, sidebar, materialKarte, voteButtons, loginSeite, filterLeiste, quellenKey, MaterialKarte } from './views.js'

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
    where: { ...where, fehlCounter: { lt: 3 }, quelle: { todesCounter: { lt: 3 } } },
    include: {
      tags: { include: { tag: true } },
      zuordnungen: { include: { teilgebiet: true, kompetenz: true } },
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
      zuordnungen: m.zuordnungen.map((z) =>
        z.kompetenz
          ? { code: z.kompetenz.code, label: z.kompetenz.text, href: `/fach/${fachCode}/k/${z.kompetenz.code}` }
          : { code: `${z.teilgebiet.code} (ganz)`, label: z.teilgebiet.name, href: `/fach/${fachCode}/t/${z.teilgebiet.code}` }
      ),
      score: m.upvotes.reduce((s, u) => s + u.wert, 0),
      meinVote: m.upvotes.find((u) => u.userId === userId)?.wert ?? 0,
      aiScore: m.qualityScore ?? 0,
    }))
    // Ranking: Community-Votes zuerst, AI-Score nur als Initial-Ranking dahinter
    .sort((a, b) => b.score - a.score || b.aiScore - a.aiScore)
}

async function alleQuellenGruppen(): Promise<string[]> {
  const quellen = await prisma.quelle.findMany({ select: { url: true } })
  return [...new Set(quellen.map((q) => quellenKey(q.url)))].sort()
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
${filterLeiste(await alleQuellenGruppen())}
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
${filterLeiste(await alleQuellenGruppen())}
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
${filterLeiste(await alleQuellenGruppen())}
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
    // Suchwörter, die auf eine Quelle passen ("oinf.ch simulation"), werden zum Quellen-Filter;
    // der Rest geht in die FTS5-Volltextsuche.
    const gruppen = await alleQuellenGruppen()
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
      // FTS5 über $queryRaw; Anfrage in Anführungszeichen = keine FTS-Syntax-Injektion
      const ftsQuery = textWoerter.map((w) => `"${w.replace(/"/g, '')}"`).join(' ')
      const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `SELECT rowid AS id FROM material_fts WHERE material_fts MATCH ? ORDER BY rank LIMIT 100`,
        ftsQuery
      )
      karten = await ladeMaterialKarten({ id: { in: rows.map((r) => Number(r.id)) }, ...quellFilter }, user?.id ?? null, STANDARD_FACH)
    } else {
      karten = await ladeMaterialKarten(quellFilter, user?.id ?? null, STANDARD_FACH)
    }
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
  const vorausgewaehlt = String(req.query.fach ?? STANDARD_FACH)
  if (!user) return res.redirect(`/login?weiter=${encodeURIComponent(`/melden?fach=${vorausgewaehlt}`)}`)
  const faecher = await prisma.fach.findMany({ select: { code: true, name: true } })
  const side = await baueSidebar(vorausgewaehlt, undefined, user)
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
  <p style="margin:.2rem 0">Deine Material-Website oder ein einzelner Kurs darauf. Atlas findet die Unterseiten selbst (Sitemap oder Links) und hält sie aktuell.</p>
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
  // Gruppierung: github.com/<user> bzw. Hostname — mehrere Repos eines Users erscheinen als eine Gruppe
  const gruppen = new Map<string, typeof quellen>()
  for (const q of quellen) {
    let key: string
    try {
      const u = new URL(q.url)
      const host = u.hostname.replace(/^www\./, '')
      key = ['github.com', 'gitlab.com', 'codeberg.org'].includes(host) ? `${host}/${u.pathname.split('/')[1] ?? ''}` : host
    } catch { key = q.url }
    if (!gruppen.has(key)) gruppen.set(key, [])
    gruppen.get(key)!.push(q)
  }
  const zeile = (q: (typeof quellen)[0]) =>
    `<tr><td><a href="${esc(q.url)}" rel="noopener">${esc(kürze(q.titel ?? q.url, 60))}</a></td><td>${esc(q.typ)}</td><td>${q.qualityScore ?? '–'}</td><td>${q.todesCounter}</td><td>${q._count.materialien}</td><td>${esc(q.melder.nickname)}</td></tr>`
  const body = `<h1>Quellen</h1>
${[...gruppen.entries()]
  .map(([key, qs]) => {
    const mats = qs.reduce((s, q) => s + q._count.materialien, 0)
    return `<details ${qs.length === 1 ? '' : 'open'} style="margin-bottom:.6rem">
<summary style="cursor:pointer;padding:.3rem 0"><strong>${esc(key)}</strong> <span class="meta">${qs.length} ${qs.length === 1 ? 'Quelle' : 'Quellen'} · ${mats} Materialien</span></summary>
<table><tr><th>URL</th><th>Typ</th><th>Score</th><th>☠</th><th>Materialien</th><th>Melder:in</th></tr>
${qs.map(zeile).join('\n')}</table>
</details>`
  })
  .join('\n')}`
  res.send(layout('Quellen', side, body, user))
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
    const side = await baueSidebar(STANDARD_FACH, undefined, null)
    res.status(400).send(layout('Fehler', side, `<p>Anmeldung fehlgeschlagen (${esc((e as Error).message)}). <a href="/login">Nochmal versuchen</a></p>`, null))
  }
})

app.post('/auth/magic', async (req, res) => {
  const email = String(req.body.email ?? '').toLowerCase().trim()
  const side = await baueSidebar(STANDARD_FACH, undefined, null)
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
    const side = await baueSidebar(STANDARD_FACH, undefined, null)
    return res.status(400).send(layout('Link ungültig', side, '<p>Der Link ist ungültig oder abgelaufen. <a href="/login">Neu anfordern</a></p>', null))
  }
  loginAbschliessen(res, await userFuerEmail(email), '/')
})

app.post('/logout', (_req, res) => {
  res.clearCookie('uid')
  res.redirect('/')
})

const PORT = Number(process.env.PORT ?? 3000)
initDb().then(() => {
  app.listen(PORT, () => console.log(`Atlas läuft auf http://localhost:${PORT}`))
})
