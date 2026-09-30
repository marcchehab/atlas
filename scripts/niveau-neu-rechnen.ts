// Rechnet Material.niveau aus den gespeicherten Kriterien neu — ohne die Materialien neu zu
// crawlen. Das ist der Zweck des Kriterienkatalogs: Ändert sich das Niveau einer Tätigkeit
// (Korrektur, später Voting), genügt ein Lauf hier.
//
//   npx tsx scripts/niveau-neu-rechnen.ts            # zeigt nur, was sich ändern würde
//   npx tsx scripts/niveau-neu-rechnen.ts --schreiben
//
// Ohne NIVEAU_QUELLE=kriterien zeigt das Skript den Unterschied trotzdem an, schreibt aber nicht:
// so lässt sich vor dem Umschalten sehen, was passieren würde.
import { prisma } from '../src/db.js'
import { fachKriterien, berechneNiveau, katalogMitStimmen, NIVEAU_QUELLE } from '../src/niveau.js'

const schreiben = process.argv.includes('--schreiben')

// Stimmen der Lehrpersonen einrechnen — der wirksame Wert einer Tätigkeit ist der Median aus
// Startwert und Stimmen.
const stimmen = await prisma.kriteriumStimme.findMany({ select: { kriteriumId: true, niveau: true } })
const stimmenNach = new Map<string, number[]>()
for (const st of stimmen) stimmenNach.set(st.kriteriumId, [...(stimmenNach.get(st.kriteriumId) ?? []), st.niveau])
if (stimmen.length) console.log(`${stimmen.length} Stimmen zu ${stimmenNach.size} Tätigkeiten eingerechnet.\n`)

const materialien = await prisma.material.findMany({
  where: { kriterien: { some: {} } },
  select: {
    id: true, niveau: true, niveauKi: true, titel: true, korrekturHash: true, niveauManuell: true,
    kriterien: { select: { kriteriumId: true, gewicht: true } },
    quelle: { select: { disziplin: true } },
  },
})

let geaendert = 0
const verschiebung: number[] = []
for (const m of materialien) {
  const roh = fachKriterien(m.quelle.disziplin ?? '') ?? fachKriterien('informatik') ?? []
  const katalog = katalogMitStimmen(roh, stimmenNach)
  const katalogWert = berechneNiveau(m.kriterien.map((k) => ({ id: k.kriteriumId, gewicht: k.gewicht })), katalog)
  // Handkorrigierte Materialien: immer der gesetzte bzw. der Katalog-Wert, unabhängig von NIVEAU_QUELLE
  const neu = m.korrekturHash ? (m.niveauManuell ?? katalogWert ?? m.niveauKi) : (katalogWert ?? m.niveauKi)
  if (neu == null || neu === m.niveau) continue
  geaendert++
  verschiebung.push(neu - (m.niveau ?? neu))
  if (geaendert <= 15) console.log(`${String(m.niveau).padStart(3)} → ${String(neu).padStart(3)}  ${m.titel.slice(0, 70)}`)
  if (schreiben) await prisma.material.update({ where: { id: m.id }, data: { niveau: neu } })
}

const mittel = verschiebung.length ? verschiebung.reduce((s, v) => s + v, 0) / verschiebung.length : 0
console.log(`\n${materialien.length} Materialien mit Kriterien, ${geaendert} würden sich ändern (Ø ${mittel > 0 ? '+' : ''}${mittel.toFixed(1)} Punkte).`)
console.log(schreiben ? 'Geschrieben.' : `Nur angezeigt — mit --schreiben übernehmen. NIVEAU_QUELLE steht auf '${NIVEAU_QUELLE}'.`)
await prisma.$disconnect()
