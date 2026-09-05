import crypto from 'node:crypto'
import { prisma } from './db.js'
import { extract, stripTags } from './extract.js'
import { klassifiziere } from './ai.js'

const TODES_SCHWELLE = 3

// Prototyp: eine Quelle = eine Seite = ein Material. Sitemap-/Git-/Cloud-Spidering kommt später.
export async function crawlQuelle(quelleId: number): Promise<string> {
  const quelle = await prisma.quelle.findUniqueOrThrow({ where: { id: quelleId } })

  let html: string
  let etag: string | null = null
  try {
    const res = await fetch(quelle.url, {
      headers: {
        'User-Agent': 'AtlasBot/0.1 (+https://atlas.eduskript.org)',
        ...(quelle.etag ? { 'If-None-Match': quelle.etag } : {}),
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })
    if (res.status === 304) {
      await prisma.quelle.update({ where: { id: quelleId }, data: { todesCounter: 0, lastCrawledAt: new Date() } })
      return 'unverändert (ETag)'
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    etag = res.headers.get('etag')
    html = await res.text()
  } catch (e) {
    const neu = quelle.todesCounter + 1
    await prisma.quelle.update({ where: { id: quelleId }, data: { todesCounter: neu } })
    // TODO: bei Erreichen der Schwelle Mail an Melder:in (Infomaniak-SMTP)
    return `Fehler (${(e as Error).message}) — Todescounter ${neu}${neu >= TODES_SCHWELLE ? ', Quelle ausgeblendet' : ''}`
  }

  const contentHash = crypto.createHash('sha256').update(html).digest('hex')
  if (contentHash === quelle.contentHash) {
    await prisma.quelle.update({ where: { id: quelleId }, data: { todesCounter: 0, lastCrawledAt: new Date() } })
    return 'unverändert (Hash)'
  }

  let text: string
  try {
    text = await extract(html)
  } catch {
    text = stripTags(html)
  }

  const lernziele = await prisma.lernziel.findMany({ select: { code: true, text: true } })
  const tags = await prisma.tag.findMany({ where: { status: 'AKTIV' }, select: { name: true } })
  const k = await klassifiziere(text, lernziele, tags.map((t) => t.name))

  await prisma.quelle.update({
    where: { id: quelleId },
    data: {
      todesCounter: 0,
      lastCrawledAt: new Date(),
      etag,
      contentHash,
      qualityScore: k.qualityScore,
      titel: quelle.titel ?? k.titel,
    },
  })

  if (k.qualityScore < 20) return `abgelehnt (Score ${k.qualityScore})`

  const material = await prisma.material.upsert({
    where: { url: quelle.url },
    create: { url: quelle.url, quelleId, titel: k.titel, zusammenfassung: k.zusammenfassung, contentHash },
    update: { titel: k.titel, zusammenfassung: k.zusammenfassung, contentHash },
  })

  const zielIds = await prisma.lernziel.findMany({ where: { code: { in: k.lernzielCodes } }, select: { id: true } })
  await prisma.materialLernziel.deleteMany({ where: { materialId: material.id } })
  await prisma.materialLernziel.createMany({ data: zielIds.map((z) => ({ materialId: material.id, lernzielId: z.id })) })

  const tagIds = await prisma.tag.findMany({ where: { name: { in: k.tags } }, select: { id: true } })
  await prisma.materialTag.deleteMany({ where: { materialId: material.id } })
  await prisma.materialTag.createMany({ data: tagIds.map((t) => ({ materialId: material.id, tagId: t.id })) })

  for (const name of k.neueTagVorschlaege.slice(0, 2)) {
    await prisma.tag.upsert({ where: { name }, create: { name, status: 'VORSCHLAG' }, update: {} })
  }

  return `ok (Score ${k.qualityScore}, ${zielIds.length} Lernziele, ${tagIds.length} Tags)`
}

// Nächtlicher Lauf: alle nicht endgültig toten Quellen. Aufruf: npm run crawl
export async function crawlAlle() {
  const quellen = await prisma.quelle.findMany({ where: { todesCounter: { lt: TODES_SCHWELLE } } })
  for (const q of quellen) {
    const resultat = await crawlQuelle(q.id)
    console.log(`${q.url} → ${resultat}`)
  }
}

if (process.argv[1]?.endsWith('crawler.ts') || process.argv[1]?.endsWith('crawler.js')) {
  crawlAlle().then(() => prisma.$disconnect())
}
