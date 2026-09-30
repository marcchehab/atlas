// Handkorrektur eines Materials: Tätigkeiten (Kriterien) und/oder Niveau von Hand setzen. Die
// Korrektur hängt am Content-Hash — kein Crawl überschreibt sie, solange sich der Inhalt nicht ändert
// (auch nicht --force oder eine neue Bewertungsversion). Ändert sich die Seite, verfällt sie.
//
//   npx tsx scripts/korrigieren.ts <url|id>                                   # Stand zeigen
//   npx tsx scripts/korrigieren.ts <url|id> --kriterien programme-lesen:2,binaer-spielerisch:1
//   npx tsx scripts/korrigieren.ts <url|id> --niveau 35                       # Wert direkt setzen
//   npx tsx scripts/korrigieren.ts <url|id> --aufheben                        # Korrektur entfernen
//
// Korrigierte Materialien zeigen immer den korrigierten Wert, unabhängig von NIVEAU_QUELLE.
import { prisma } from '../src/db.js'
import { fachKriterien, katalogMitStimmen, berechneNiveau, niveauBandName } from '../src/niveau.js'

const [ziel, ...rest] = process.argv.slice(2)
if (!ziel) { console.error('Aufruf: korrigieren.ts <url|id> [--kriterien id:gewicht,…] [--niveau N] [--aufheben]'); process.exit(1) }
const opt = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined }

const m = await prisma.material.findFirst({
  where: /^\d+$/.test(ziel) ? { id: Number(ziel) } : { url: ziel },
  include: { quelle: { select: { disziplin: true } }, kriterien: true },
})
if (!m) { console.error(`Kein Material: ${ziel}`); process.exit(1) }

const stimmen = await prisma.kriteriumStimme.findMany({ select: { kriteriumId: true, niveau: true } })
const sn = new Map<string, number[]>()
for (const st of stimmen) sn.set(st.kriteriumId, [...(sn.get(st.kriteriumId) ?? []), st.niveau])
const katalog = katalogMitStimmen(fachKriterien(m.quelle.disziplin ?? '') ?? fachKriterien('informatik') ?? [], sn)
const nach = new Map(katalog.map((k) => [k.id, k]))

const zeige = (titel: string, ks: { kriteriumId: string; gewicht: number }[], niveau: number | null) => {
  console.log(`${titel}: Niveau ${niveau ?? '–'}${niveau != null ? ` (${niveauBandName(niveau)})` : ''}`)
  for (const k of ks) console.log(`   ${nach.get(k.kriteriumId)?.niveau ?? '?'} ×${k.gewicht}  ${k.kriteriumId}  ${nach.get(k.kriteriumId)?.text ?? '(nicht im Katalog)'}`)
}

console.log(`${m.titel}\n${m.url}\nKI direkt: ${m.niveauKi ?? '–'}${m.korrekturHash ? `  ·  handkorrigiert${m.niveauManuell != null ? ` (Niveau ${m.niveauManuell} gesetzt)` : ''}` : ''}`)
zeige('Jetzt', m.kriterien, m.niveau)

if (rest.includes('--aufheben')) {
  await prisma.material.update({ where: { id: m.id }, data: { korrekturHash: null, niveauManuell: null, bewertungsVersion: null } })
  console.log('Korrektur aufgehoben — der nächste Crawl bewertet neu.')
} else if (opt('--kriterien') || opt('--niveau')) {
  let ks = m.kriterien.map((k) => ({ kriteriumId: k.kriteriumId, gewicht: k.gewicht }))
  if (opt('--kriterien')) {
    ks = opt('--kriterien')!.split(',').filter(Boolean).map((p) => {
      const [id, g] = p.split(':')
      if (!nach.has(id)) { console.error(`Unbekannte Tätigkeit: ${id}\nKatalog: ${[...nach.keys()].join(', ')}`); process.exit(1) }
      return { kriteriumId: id, gewicht: Math.min(3, Math.max(1, Number(g ?? 2))) }
    })
    await prisma.materialKriterium.deleteMany({ where: { materialId: m.id } })
    await prisma.materialKriterium.createMany({ data: ks.map((k) => ({ materialId: m.id, ...k })) })
  }
  const niveauManuell = opt('--niveau') ? Math.max(1, Math.min(100, Number(opt('--niveau')))) : null
  const niveau = niveauManuell ?? berechneNiveau(ks.map((k) => ({ id: k.kriteriumId, gewicht: k.gewicht })), katalog) ?? m.niveauKi
  await prisma.material.update({ where: { id: m.id }, data: { korrekturHash: m.contentHash, niveauManuell, niveau } })
  zeige('Neu', ks, niveau)
}
await prisma.$disconnect()
