// Niveau-Test gegen Zielwerte: Materialien mit dem aktuellen Chemie-Katalog neu klassifizieren, ohne DB-Schreiben.
//   npx tsx scripts/niveau-ziel-test.ts <materialId>=<ziel> [...]
import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../src/db.js'
import { klassifiziere } from '../src/ai.js'
import { fachKriterien, fachAnker, niveauScore } from '../src/niveau.js'
import { extract } from '../src/extract.js'
import { dateiText } from '../src/crawler.js'
import { STICHWORTE } from '../src/stichworte.js'

const ziele = new Map(process.argv.slice(2).map((a) => a.split('=').map(Number) as [number, number]))
const ids = [...ziele.keys()]
const fehler: number[] = []
const katalog = fachKriterien('chemie')!
const anker = fachAnker('chemie')!.anker.split('\n').map((z) => `   ${z}`).join('\n')
const tgs = await prisma.teilgebiet.findMany({ where: { lerngebiet: { fach: { code: 'chemie-gf' } } }, include: { kompetenzen: true, lerngebiet: true } })
const optionen = tgs.flatMap((tg) => [
  { code: `T:chemie-gf:${tg.code}`, label: `${tg.lerngebiet.name} → ${tg.name} (gesamtes Teilgebiet)${STICHWORTE[`chemie-gf:${tg.code}`] ? ` — Themen z.B.: ${STICHWORTE[`chemie-gf:${tg.code}`]}` : ''}` },
  ...tg.kompetenzen.map((ko) => ({ code: `K:chemie-gf:${ko.code}`, label: ko.text })),
])
const tags = (await prisma.tag.findMany({ where: { status: 'AKTIV' } })).map((t) => t.name)
for (const id of ids) {
  const m = await prisma.material.findUniqueOrThrow({ where: { id }, include: { kriterien: true } })
  const res = await fetch(m.url, { headers: { 'User-Agent': 'AtlasBot/0.1 (+https://atlas.eduskript.org)' } })
  const ext = path.extname(new URL(m.url).pathname).toLowerCase()
  let text: string | null
  if (['.pdf', '.doc', '.docx', '.pptx', '.odt'].includes(ext)) {
    const tmp = `/tmp/kt-${id}${ext}`
    await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()))
    text = await dateiText(tmp)
  } else text = await extract(await res.text())
  let k
  try { k = await klassifiziere(text ?? '', optionen, tags, anker, katalog) } catch (e) { try { k = await klassifiziere(text ?? '', optionen, tags, anker, katalog) } catch { console.log(`\n#${id} AI-Fehler`); continue } }
  const neu = niveauScore(k.kriterien, katalog, k.niveau)
  const ziel = ziele.get(id)!; fehler.push(Math.abs(neu - ziel))
  console.log(`\n#${id} [Ziel ${ziel}, Abweichung ${neu - ziel}] ${m.titel}\n  alt: niveau ${m.niveau} (KI ${m.niveauKi}) — ${m.kriterien.map((x) => `${x.kriteriumId}:${x.gewicht}`).join(', ')}\n  neu: niveau ${neu} (KI ${k.niveau}) — ${k.kriterien.map((x) => `${x.id}:${x.gewicht}`).join(', ')}`)
}
console.log(`\nMAE ${(fehler.reduce((a, b) => a + b, 0) / fehler.length).toFixed(1)}`)
await prisma.$disconnect()
