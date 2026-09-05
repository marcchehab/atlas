import { prisma, initDb } from './db.js'

// ACHTUNG: Platzhalter-Lernziele, thematisch an den RLP 2024 (GF Informatik, ab S. 67) angelehnt.
// Vor dem Launch durch die echten Lernziele auf feinster Ebene ersetzen.
const LERNZIELE = [
  ['INF.1.1', 'Daten und Information', 'Digitale Daten in verschiedenen Repräsentationen (Binärsystem, Zeichencodierung) darstellen und umrechnen'],
  ['INF.1.2', 'Daten und Information', 'Verlustfreie und verlustbehaftete Kompression erklären und an Beispielen anwenden'],
  ['INF.1.3', 'Daten und Information', 'Daten in strukturierten Formaten und Datenbanken organisieren und mit Abfragen auswerten'],
  ['INF.2.1', 'Algorithmen und Programmieren', 'Algorithmen als eindeutige Handlungsanweisungen formulieren und ihre Eigenschaften beschreiben'],
  ['INF.2.2', 'Algorithmen und Programmieren', 'Programme mit Variablen, Verzweigungen und Schleifen in einer Programmiersprache umsetzen'],
  ['INF.2.3', 'Algorithmen und Programmieren', 'Programme mit Funktionen und Parametern strukturieren'],
  ['INF.2.4', 'Algorithmen und Programmieren', 'Such- und Sortieralgorithmen vergleichen und ihre Effizienz einschätzen'],
  ['INF.3.1', 'Rechner und Netze', 'Aufbau und Funktionsweise eines Computers (Prozessor, Speicher, Ein-/Ausgabe) erklären'],
  ['INF.3.2', 'Rechner und Netze', 'Aufbau des Internets und grundlegende Protokolle (IP, DNS, HTTP) erklären'],
  ['INF.3.3', 'Rechner und Netze', 'Grundprinzipien der Verschlüsselung und sicheren Kommunikation erklären'],
  ['INF.4.1', 'Informatik, Mensch und Gesellschaft', 'Chancen und Risiken der Digitalisierung an konkreten Beispielen beurteilen'],
  ['INF.4.2', 'Informatik, Mensch und Gesellschaft', 'Funktionsweise und Grenzen von Systemen des maschinellen Lernens erklären'],
] as const

const TAGS = ['python', 'spielerisch', 'formell', 'unplugged', 'video', 'arbeitsblatt', 'projekt', 'theorie']

async function seed() {
  await initDb()
  for (const [code, bereich, text] of LERNZIELE) {
    await prisma.lernziel.upsert({ where: { code }, create: { code, fach: 'Informatik', bereich, text }, update: { bereich, text } })
  }
  for (const name of TAGS) {
    await prisma.tag.upsert({ where: { name }, create: { name, status: 'AKTIV' }, update: {} })
  }
  console.log(`Seed ok: ${LERNZIELE.length} Lernziele (Platzhalter!), ${TAGS.length} Tags`)
}

seed().then(() => prisma.$disconnect())
