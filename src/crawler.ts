import crypto from 'node:crypto'
import { prisma } from './db.js'
import { extract, stripTags } from './extract.js'
import { klassifiziere } from './ai.js'

const TODES_SCHWELLE = 3

// Prototyp: eine Quelle = eine Seite = ein Material. Sitemap-/Git-/Cloud-Spidering kommt später.
export async function crawlQuelle(quelleId: number, force = false): Promise<string> {
  const quelle = await prisma.quelle.findUniqueOrThrow({ where: { id: quelleId } })

  let html: string
  let etag: string | null = null
  try {
    const res = await fetch(quelle.url, {
      headers: {
        'User-Agent': 'AtlasBot/0.1 (+https://atlas.eduskript.org)',
        ...(quelle.etag && !force ? { 'If-None-Match': quelle.etag } : {}),
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
  if (contentHash === quelle.contentHash && !force) {
    await prisma.quelle.update({ where: { id: quelleId }, data: { todesCounter: 0, lastCrawledAt: new Date() } })
    return 'unverändert (Hash)'
  }

  let text: string
  try {
    text = await extract(html)
  } catch {
    text = stripTags(html)
  }

  const teilgebiete = await prisma.teilgebiet.findMany({ include: { kompetenzen: true, lerngebiet: true } })
  const optionen = teilgebiete.flatMap((tg) => [
    { code: `T${tg.code}`, label: `${tg.lerngebiet.name} → ${tg.name} (gesamtes Teilgebiet)` },
    ...tg.kompetenzen.map((ko) => ({ code: `K${ko.code}`, label: ko.text })),
  ])
  const tags = await prisma.tag.findMany({ where: { status: 'AKTIV' }, select: { name: true } })
  const k = await klassifiziere(text, optionen, tags.map((t) => t.name))

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

  // Codes auflösen: "T1.2" → Teilgebiet, "K1.2.1" → Kompetenz (Teilgebiet immer mitschreiben)
  const zuordnungen: { teilgebietId: number; kompetenzId: number | null }[] = []
  for (const code of k.zuordnungen) {
    if (code.startsWith('T')) {
      const tg = teilgebiete.find((t) => t.code === code.slice(1))
      if (tg) zuordnungen.push({ teilgebietId: tg.id, kompetenzId: null })
    } else if (code.startsWith('K')) {
      for (const tg of teilgebiete) {
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

  for (const name of k.neueTagVorschlaege.slice(0, 2)) {
    await prisma.tag.upsert({ where: { name }, create: { name, status: 'VORSCHLAG' }, update: {} })
  }

  return `ok (Score ${k.qualityScore}, ${zuordnungen.length} Zuordnungen, ${tagIds.length} Tags)`
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
