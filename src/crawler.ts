import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from './db.js'
import { extract, stripTags } from './extract.js'
import { klassifiziere, ZuordnungsOption } from './ai.js'

const TODES_SCHWELLE = 3
const MAX_SEITEN = 200 // Deckel pro Quelle und Nacht — Rest kommt in späteren Läufen

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

function fetchSeite(url: string): Promise<Response> {
  return fetch(url, {
    headers: { 'User-Agent': 'AtlasBot/0.1 (+https://atlas.eduskript.org)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  })
}

interface KlassifikationsKontext {
  optionen: ZuordnungsOption[]
  tagNamen: string[]
  teilgebiete: Awaited<ReturnType<typeof ladeKontext>>['teilgebiete']
}

async function ladeKontext() {
  const teilgebiete = await prisma.teilgebiet.findMany({ include: { kompetenzen: true, lerngebiet: true } })
  const optionen = teilgebiete.flatMap((tg) => [
    { code: `T${tg.code}`, label: `${tg.lerngebiet.name} → ${tg.name} (gesamtes Teilgebiet)` },
    ...tg.kompetenzen.map((ko) => ({ code: `K${ko.code}`, label: ko.text })),
  ])
  const tags = await prisma.tag.findMany({ where: { status: 'AKTIV' }, select: { name: true } })
  return { optionen, tagNamen: tags.map((t) => t.name), teilgebiete }
}

// Ein Text (Seite oder Datei) → Klassifikation → Material mit Zuordnungen/Tags.
async function verarbeiteMaterial(
  quelleId: number,
  url: string,
  text: string,
  contentHash: string,
  ctx: KlassifikationsKontext,
  force = false,
  istEinzelseite = false
): Promise<'neu' | 'aktualisiert' | 'unverändert' | 'abgelehnt'> {
  const vorhanden = await prisma.material.findUnique({ where: { url } })
  if (vorhanden && vorhanden.contentHash === contentHash && !force) return 'unverändert'

  const k = await klassifiziere(text, ctx.optionen, ctx.tagNamen)
  // Eine einzelne Webseite, die >=5 ganze Teilgebiete abdecken soll, ist eine
  // Übersichts-/Portalseite — ablehnen. Ganze Skript-Repos dürfen breit sein.
  const zuBreit = istEinzelseite && k.zuordnungen.filter((c) => c.startsWith('T')).length >= 5
  if (k.qualityScore < 20 || zuBreit) {
    if (vorhanden) await prisma.material.delete({ where: { url } }) // war mal gut, ist jetzt Schrott
    return 'abgelehnt'
  }

  const material = await prisma.material.upsert({
    where: { url },
    create: { url, quelleId, titel: k.titel, zusammenfassung: k.zusammenfassung, qualityScore: k.qualityScore, contentHash },
    update: { titel: k.titel, zusammenfassung: k.zusammenfassung, qualityScore: k.qualityScore, contentHash },
  })

  const zuordnungen: { teilgebietId: number; kompetenzId: number | null }[] = []
  for (const code of k.zuordnungen) {
    if (code.startsWith('T')) {
      const tg = ctx.teilgebiete.find((t) => t.code === code.slice(1))
      if (tg) zuordnungen.push({ teilgebietId: tg.id, kompetenzId: null })
    } else if (code.startsWith('K')) {
      for (const tg of ctx.teilgebiete) {
        const ko = tg.kompetenzen.find((x) => x.code === code.slice(1))
        if (ko) zuordnungen.push({ teilgebietId: tg.id, kompetenzId: ko.id })
      }
    }
  }
  await prisma.materialZuordnung.deleteMany({ where: { materialId: material.id } })
  await prisma.materialZuordnung.createMany({ data: zuordnungen.map((z) => ({ materialId: material.id, ...z })) })

  const tagIds = await prisma.tag.findMany({ where: { name: { in: k.tags } }, select: { id: true } })
  await prisma.materialTag.deleteMany({ where: { materialId: material.id } })
  await prisma.materialTag.createMany({ data: tagIds.map((t) => ({ materialId: material.id, tagId: t.id })) })

  for (const roh of k.neueTagVorschlaege.slice(0, 2)) {
    const name = roh.toLowerCase().trim()
    if (name.length < 3 || name.length > 30) continue
    await prisma.tag.upsert({ where: { name }, create: { name, status: 'VORSCHLAG' }, update: {} })
  }
  return vorhanden ? 'aktualisiert' : 'neu'
}

// Nach dem Crawl: verschwundene URLs behandeln. Gleicher Content-Hash innerhalb derselben
// Quelle = Umzug (Votes wandern mit). AI-Titel wäre der intuitivere Schlüssel, ist aber
// instabil — dieselbe Seite bekommt bei Re-Klassifikation leicht andere Titel. Umzug mit
// gleichzeitiger Inhaltsänderung fällt auf den fehlCounter zurück: hochzählen, ab 3
// Crawls in Folge ausgeblendet. Bei gedeckelten Crawls nicht anwendbar — fehlende URLs
// könnten schlicht hinter dem Deckel liegen.
async function raeumeAuf(quelleId: number, gesehen: Set<string>, gedeckelt: boolean): Promise<string> {
  if (gedeckelt) return ''
  await prisma.material.updateMany({ where: { quelleId, url: { in: [...gesehen] } }, data: { fehlCounter: 0 } })
  const verschwunden = await prisma.material.findMany({ where: { quelleId, url: { notIn: [...gesehen] } } })
  let umzuege = 0
  let verwaist = 0
  for (const alt of verschwunden) {
    const neu = alt.contentHash
      ? await prisma.material.findFirst({
          where: { quelleId, url: { in: [...gesehen] }, contentHash: alt.contentHash, id: { not: alt.id } },
        })
      : null
    if (neu) {
      // Votes zügeln (Konflikt = User hat beide gevotet → alten Vote verwerfen)
      const votes = await prisma.upvote.findMany({ where: { materialId: alt.id } })
      for (const v of votes) {
        await prisma.upvote
          .update({ where: { userId_materialId: { userId: v.userId, materialId: alt.id } }, data: { materialId: neu.id } })
          .catch(() => {})
      }
      await prisma.material.delete({ where: { id: alt.id } })
      umzuege++
    } else {
      await prisma.material.update({ where: { id: alt.id }, data: { fehlCounter: alt.fehlCounter + 1 } })
      verwaist++
    }
  }
  return umzuege || verwaist ? `, ${umzuege} umgezogen, ${verwaist} verschollen` : ''
}

// ---------- Website-Connector: Sitemap bevorzugt, sonst Links der Startseite ----------

const BINAER = /\.(pdf|zip|png|jpe?g|gif|svg|ico|css|js|mp[34]|webm|woff2?|xml|txt)(\?|$)/i

function sammleUrls(quelleUrl: string, html: string): string[] {
  const basis = new URL(quelleUrl)
  const urls = new Set<string>()
  for (const m of html.matchAll(/href="([^"#]+)"/g)) {
    try {
      const u = new URL(m[1], quelleUrl)
      if (u.hostname !== basis.hostname || BINAER.test(u.pathname)) continue
      u.hash = ''
      u.search = ''
      urls.add(u.toString())
    } catch { /* kaputte hrefs ignorieren */ }
  }
  return [...urls]
}

async function ladeSitemap(origin: string): Promise<string[] | null> {
  try {
    const res = await fetchSeite(`${origin}/sitemap.xml`)
    if (!res.ok) return null
    let xml = await res.text()
    // Sitemap-Index: erste Kind-Sitemaps nachladen
    if (xml.includes('<sitemapindex')) {
      const kinder = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, 5)
      const teile = await Promise.all(
        kinder.map((u) => fetchSeite(u.trim()).then((r) => (r.ok ? r.text() : '')).catch(() => ''))
      )
      xml = teile.join('\n')
    }
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
    return urls.length ? urls : null
  } catch {
    return null
  }
}

async function crawlWebsite(quelle: { id: number; url: string }, ctx: KlassifikationsKontext, force: boolean): Promise<string> {
  const startRes = await fetchSeite(quelle.url)
  if (!startRes.ok) throw new Error(`HTTP ${startRes.status}`)
  const startHtml = await startRes.text()

  const origin = new URL(quelle.url).origin
  const sitemap = await ladeSitemap(origin)
  let urls = sitemap ?? [quelle.url, ...sammleUrls(quelle.url, startHtml)]
  urls = urls.filter((u) => {
    try {
      const p = new URL(u)
      return p.hostname === new URL(quelle.url).hostname && !BINAER.test(p.pathname)
    } catch { return false }
  })
  const gedeckelt = urls.length > MAX_SEITEN
  if (gedeckelt) urls = urls.slice(0, MAX_SEITEN)

  const stat = { neu: 0, aktualisiert: 0, unverändert: 0, abgelehnt: 0, duplikat: 0, fehler: 0 }
  const gesehen = new Set<string>()
  for (const url of urls) {
    try {
      const res = url === quelle.url ? null : await fetchSeite(url)
      const html = res ? (res.ok ? await res.text() : null) : startHtml
      if (html == null) { stat.fehler++; continue }
      gesehen.add(url)
      // Hash über den extrahierten Text, nicht das rohe HTML: stabil gegen kosmetische
      // HTML-Änderungen und Grundlage der Duplikat-Erkennung (SPAs liefern auf jeder
      // URL dasselbe serverseitige Gerüst — z.B. Eduskript-Sites, solange deren
      // Markdown-Export fehlt).
      let text: string
      try { text = await extract(html) } catch { text = stripTags(html) }
      const h = hash(text)
      const vorhanden = await prisma.material.findUnique({ where: { url } })
      if (vorhanden && vorhanden.contentHash === h && !force) { stat.unverändert++; continue }
      const dupe = await prisma.material.findFirst({ where: { quelleId: quelle.id, contentHash: h, url: { not: url } } })
      if (dupe) {
        if (vorhanden) await prisma.material.delete({ where: { url } })
        stat.duplikat++
        continue
      }
      stat[await verarbeiteMaterial(quelle.id, url, text, h, ctx, force, true)]++
    } catch { stat.fehler++ }
  }
  const aufraeumen = await raeumeAuf(quelle.id, gesehen, gedeckelt)
  return `${urls.length} Seiten${gedeckelt ? ` (gedeckelt, ${MAX_SEITEN}/Nacht)` : ''} via ${sitemap ? 'Sitemap' : 'Links'}: ${stat.neu} neu, ${stat.aktualisiert} aktualisiert, ${stat.unverändert} unverändert, ${stat.duplikat} Duplikate, ${stat.abgelehnt} abgelehnt, ${stat.fehler} Fehler${aufraeumen}`
}

// ---------- Git-Connector: Repo klonen, Markdown-Dateien als Materialien ----------

function git(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.slice(0, 200)))))
  })
}

async function crawlGit(quelle: { id: number; url: string; contentHash: string | null }, ctx: KlassifikationsKontext, force: boolean): Promise<string> {
  const dir = path.join(process.cwd(), 'data', 'git', String(quelle.id))
  const existiert = await fs.access(path.join(dir, '.git')).then(() => true, () => false)
  if (existiert) await git(['pull', '--ff-only'], dir)
  else {
    await fs.mkdir(dir, { recursive: true })
    await git(['clone', '--depth', '1', quelle.url, dir])
  }
  const head = await git(['rev-parse', 'HEAD'], dir)
  if (head === quelle.contentHash && !force) return 'unverändert (HEAD)'

  const mdDateien = (await git(['ls-files', '*.md', '*.markdown'], dir)).split('\n').filter(Boolean)
  const stat = { neu: 0, aktualisiert: 0, unverändert: 0, abgelehnt: 0, fehler: 0 }

  if (mdDateien.length >= 3) {
    // Markdown-Sammlung: jede Datei ein Material
    const gesehen = new Set<string>()
    for (const datei of mdDateien.slice(0, MAX_SEITEN)) {
      try {
        const text = await fs.readFile(path.join(dir, datei), 'utf8')
        const url = `${quelle.url.replace(/\.git$/, '')}/blob/HEAD/${datei}` // GitHub/GitLab-kompatibel
        gesehen.add(url)
        stat[await verarbeiteMaterial(quelle.id, url, text, hash(text), ctx, force)]++
      } catch { stat.fehler++ }
    }
    await prisma.quelle.update({ where: { id: quelle.id }, data: { contentHash: head } })
    const aufraeumen = await raeumeAuf(quelle.id, gesehen, mdDateien.length > MAX_SEITEN)
    return `${Math.min(mdDateien.length, MAX_SEITEN)} Markdown-Dateien: ${stat.neu} neu, ${stat.aktualisiert} aktualisiert, ${stat.unverändert} unverändert, ${stat.abgelehnt} abgelehnt, ${stat.fehler} Fehler${aufraeumen}`
  }

  // Sonst (z.B. LaTeX-Skript): ganzes Repo als ein Material, Text aus README + .tex/.md
  const texDateien = (await git(['ls-files', '*.tex'], dir)).split('\n').filter(Boolean)
  const teile: string[] = []
  for (const datei of [...mdDateien, ...texDateien]) {
    try { teile.push(await fs.readFile(path.join(dir, datei), 'utf8')) } catch { /* Binärdatei o.ä. */ }
  }
  const text = teile
    .join('\n\n')
    .replace(/(?<!\\)%.*$/gm, '') // LaTeX-Kommentare
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, ' ') // \Befehle
    .replace(/[{}]/g, '')
    .slice(0, 120000)
  const url = quelle.url.replace(/\.git$/, '')
  stat[await verarbeiteMaterial(quelle.id, url, text, hash(text), ctx, force)]++
  await prisma.quelle.update({ where: { id: quelle.id }, data: { contentHash: head } })
  const aufraeumen = await raeumeAuf(quelle.id, new Set([url]), false)
  return `1 Repo-Material (${mdDateien.length} md, ${texDateien.length} tex): ${stat.neu} neu, ${stat.aktualisiert} aktualisiert, ${stat.unverändert} unverändert, ${stat.abgelehnt} abgelehnt${aufraeumen}`
}

// ---------- Cloud-Connector: Freigabelink → Ordner-Zip → Dateien als Materialien ----------
// Anonyme Share-Links erlauben kein rclone (bräuchte OAuth pro Anbieter), aber OneDrive,
// Dropbox und Nextcloud liefern den Ordner anonym als Zip. Google Drive kann das nicht → später.

function cloudZipUrl(url: string): string {
  const u = new URL(url)
  const host = u.hostname.replace(/^www\./, '')
  if (host === '1drv.ms' || host === 'onedrive.live.com') {
    const b64 = Buffer.from(url).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    return `https://api.onedrive.com/v1.0/shares/u!${b64}/root/content`
  }
  if (host.endsWith('dropbox.com')) {
    u.searchParams.set('dl', '1')
    return u.toString()
  }
  if (/^\/s\/[^/]+\/?$/.test(u.pathname)) return `${u.origin}${u.pathname.replace(/\/$/, '')}/download`
  throw new Error('Cloud-Anbieter noch nicht unterstützt (Google Drive folgt)')
}

const PYTHON = path.join(process.cwd(), '.venv', 'bin', 'python')

function python(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(PYTHON, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.slice(0, 200)))))
  })
}

// Entpacken mit Zip-Slip-Schutz (keine absoluten Pfade, kein "..")
const UNZIP_PY = `
import sys, zipfile, os
z = zipfile.ZipFile(sys.argv[1]); out = sys.argv[2]
for i in z.infolist():
    n = i.filename
    if n.endswith('/') or n.startswith('/') or '..' in n.split('/'): continue
    d = os.path.join(out, n)
    os.makedirs(os.path.dirname(d) or out, exist_ok=True)
    open(d, 'wb').write(z.read(i))
`

function pdftotext(pfad: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('pdftotext', [pfad, '-'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`pdftotext exit ${code}`))))
  })
}

async function dateiText(pfad: string): Promise<string | null> {
  const ext = path.extname(pfad).toLowerCase()
  try {
    if (['.md', '.markdown', '.txt', '.tex'].includes(ext)) return await fs.readFile(pfad, 'utf8')
    if (['.html', '.htm'].includes(ext)) {
      const html = await fs.readFile(pfad, 'utf8')
      try { return await extract(html) } catch { return stripTags(html) }
    }
    if (ext === '.pdf') return await pdftotext(pfad)
    if (ext === '.docx' || ext === '.odt') {
      const inner = ext === '.docx' ? 'word/document.xml' : 'content.xml'
      const xml = await python(['-c', `import sys,zipfile;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read('${inner}').decode('utf8','ignore'))`, pfad])
      return stripTags(xml.replace(/></g, '> <'))
    }
  } catch { return null }
  return null
}

async function crawlCloud(quelle: { id: number; url: string; contentHash: string | null }, ctx: KlassifikationsKontext, force: boolean): Promise<string> {
  const zipUrl = cloudZipUrl(quelle.url)
  const res = await fetch(zipUrl, {
    headers: { 'User-Agent': 'AtlasBot/0.1 (+https://atlas.eduskript.org)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`Zip-Download HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 200 * 1024 * 1024) throw new Error('Ordner grösser als 200 MB')

  const dir = path.join(process.cwd(), 'data', 'cloud', String(quelle.id))
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  const zipPfad = `${dir}.zip`
  await fs.writeFile(zipPfad, buf)
  await python(['-c', UNZIP_PY, zipPfad, dir])
  await fs.rm(zipPfad, { force: true })

  const alle = (await fs.readdir(dir, { recursive: true })) as string[]
  const dateien: string[] = []
  for (const rel of alle) {
    const stat = await fs.stat(path.join(dir, rel))
    if (stat.isFile()) dateien.push(rel)
  }
  const gedeckelt = dateien.length > MAX_SEITEN

  const stat = { neu: 0, aktualisiert: 0, unverändert: 0, abgelehnt: 0, übersprungen: 0, fehler: 0 }
  const gesehen = new Set<string>()
  for (const rel of dateien.slice(0, MAX_SEITEN)) {
    try {
      const text = await dateiText(path.join(dir, rel))
      if (!text || text.trim().length < 50) { stat.übersprungen++; continue }
      const url = `${quelle.url}#${rel}` // kein Deep-Link in anonyme Freigaben möglich — Fragment macht die URL eindeutig
      gesehen.add(url)
      stat[await verarbeiteMaterial(quelle.id, url, text, hash(text), ctx, force, true)]++
    } catch { stat.fehler++ }
  }
  const aufraeumen = await raeumeAuf(quelle.id, gesehen, gedeckelt)
  return `${dateien.length} Dateien${gedeckelt ? ` (gedeckelt, ${MAX_SEITEN}/Nacht)` : ''}: ${stat.neu} neu, ${stat.aktualisiert} aktualisiert, ${stat.unverändert} unverändert, ${stat.übersprungen} übersprungen, ${stat.abgelehnt} abgelehnt, ${stat.fehler} Fehler${aufraeumen}`
}

// ---------- Einstieg ----------

export async function crawlQuelle(quelleId: number, force = false): Promise<string> {
  const quelle = await prisma.quelle.findUniqueOrThrow({ where: { id: quelleId } })
  const ctx = await ladeKontext()
  try {
    const resultat =
      quelle.typ === 'GIT' ? await crawlGit(quelle, ctx, force)
      : quelle.typ === 'CLOUD' ? await crawlCloud(quelle, ctx, force)
      : await crawlWebsite(quelle, ctx, force)
    const maxScore = await prisma.material.aggregate({ where: { quelleId }, _max: { qualityScore: true } })
    const u = new URL(quelle.url)
    const titel = quelle.titel ?? (quelle.typ === 'GIT' ? u.pathname.replace(/^\/|\.git$/g, '') : u.hostname)
    await prisma.quelle.update({
      where: { id: quelleId },
      data: { todesCounter: 0, lastCrawledAt: new Date(), qualityScore: maxScore._max.qualityScore ?? 0, titel },
    })
    return resultat
  } catch (e) {
    const neu = quelle.todesCounter + 1
    await prisma.quelle.update({ where: { id: quelleId }, data: { todesCounter: neu } })
    // TODO: bei Erreichen der Schwelle Mail an Melder:in (Infomaniak-SMTP)
    return `Fehler (${(e as Error).message}) — Todescounter ${neu}${neu >= TODES_SCHWELLE ? ', Quelle ausgeblendet' : ''}`
  }
}

// Nächtlicher Lauf: alle nicht endgültig toten Quellen.
// Aufruf: npm run crawl [-- --force]  (--force: Änderungserkennung umgehen, alles neu klassifizieren)
export async function crawlAlle(force = false) {
  const quellen = await prisma.quelle.findMany({ where: { todesCounter: { lt: TODES_SCHWELLE } } })
  for (const q of quellen) {
    const resultat = await crawlQuelle(q.id, force)
    console.log(`${q.url} → ${resultat}`)
  }
}

if (process.argv[1]?.endsWith('crawler.ts') || process.argv[1]?.endsWith('crawler.js')) {
  crawlAlle(process.argv.includes('--force')).then(() => prisma.$disconnect())
}
