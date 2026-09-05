import { prisma, initDb } from './db.js'

// Rahmenlehrplan Maturitätsschulen (EDK 2024), Grundlagenfach Informatik,
// Kapitel 4 «Lerngebiete und fachliche Kompetenzen» (PDF S. 69–70).
// Kompetenz-Codes (1.2.1 …) sind eigene Zählung — der RLP nummeriert Kompetenzen nicht.
const LEHRPLAN_URL = 'https://edudoc.ch/record/232281/files/Rahmenlehrplan-maturitatsschulen.pdf'

type LerngebietDef = [nummer: number, name: string, teilgebiete: [code: string, name: string, kompetenzen: string[]][]]

const INFORMATIK: LerngebietDef[] = [
  [1, 'Algorithmen und Programme', [
    ['1.1', 'Grundlagen', [
      'den Begriff Algorithmus definieren und seine Eigenschaften benennen',
      'Algorithmen anwenden und entwickeln',
    ]],
    ['1.2', 'Algorithmische Problemlösung', [
      'Probleme lösen, indem sie diese in Teilprobleme zerlegen',
      'einfache Algorithmen zur Lösung von Problemen entwerfen oder sich kreativ mittels Programmierung ausdrücken (z.B. interaktive Kunst)',
      'klassische Algorithmen (z.B. für Sortieren oder Suchen) zur Lösung eines Problems beschreiben, anwenden und vergleichen',
    ]],
    ['1.3', 'Programmieren', [
      'einen gut lesbaren, strukturierten und modularisierten Programmiercode schreiben und dokumentieren',
      'Befehlssequenzen manuell (Schritt-für-Schritt) durchführen und das Ergebnis bestimmen',
      'bestehende Programme sinnvoll abändern und erweitern',
      'Fehler in einem Programm durch systematisches Testen identifizieren und korrigieren',
      'Datentypen und -strukturen sinnvoll einsetzen',
    ]],
  ]],
  [2, 'Daten und Information', [
    ['2.1', 'Datenrepräsentation', [
      'verschiedene Darstellungen von Informationen erläutern, deren Besonderheiten und Grenzen analysieren (z.B. Zahlen, Bilder, Texte, Töne)',
      'mit verschiedenen Arten der Codierung und ihren inhärenten Grenzen experimentieren (z.B. Umwandlung in verschiedene Zahlensysteme, Komprimierung und Dekomprimierung)',
    ]],
    ['2.2', 'Datenmanagement', [
      'unterschiedliche Systeme der Organisation und zur Speicherung von Daten vergleichen',
      'die Eigenschaften verschiedener Datenspeichersysteme bewerten (z.B. zentrale, dezentrale Speicherung)',
    ]],
    ['2.3', 'Data-Science', [
      'Informationen aus Daten extrahieren und die Ergebnisse diskutieren (z.B. Punktwolken, Diagramme)',
      'automatische Informationsverarbeitungssysteme untersuchen',
      'grundlegende Konzepte der künstlichen Intelligenz erklären',
    ]],
  ]],
  [3, 'Systeme und Vernetzung', [
    ['3.1', 'Informatiksysteme', [
      'die Architektur eines Computers und die Funktionsweise seiner Hauptkomponenten beschreiben',
      'die Interaktion zwischen Hardware, Betriebssystem und Anwendungsprogrammen erklären',
    ]],
    ['3.2', 'Netzwerke', [
      'die Bestandteile (z.B. Hardware, Protokolle) von Netzwerken beschreiben',
      'die Funktionsweise von vernetzten Systemen erläutern (z.B. Aufrufen eines Weblinks, Versenden einer E-Mail)',
      'Netzwerkarchitekturen vergleichen (z.B. Client-Server Modell, Cloud-Computing, P2P)',
    ]],
    ['3.3', 'Sicherheitsprinzipien', [
      'verschiedene Cyber-Bedrohungen (z.B. Malware, Social Engineering), Abwehrstrategien und Vorsichtsmassnahmen erklären',
      'die Grundprinzipien der Informationssicherheit darlegen (Verfügbarkeit, Integrität, Vertraulichkeit)',
      'mit verschiedenen Methoden der Informationssicherheit experimentieren (z.B. Kryptographie, Prüfziffern, Authentifizierung)',
    ]],
  ]],
  [4, 'Historische Perspektiven und aktuelle Herausforderungen', [
    ['4.1', 'Historische Perspektiven', [
      'in ausgewählten Themen der Lerngebiete 1 bis 3 die Entstehung und den historischen Kontext darstellen',
    ]],
    ['4.2', 'Aktuelle Herausforderungen', [
      'aktuelle und zukünftige Probleme und Herausforderungen in ausgewählten Themen der Lerngebiete 1 bis 3 identifizieren und diskutieren',
    ]],
  ]],
]

const TAGS = ['python', 'spielerisch', 'formell', 'unplugged', 'video', 'arbeitsblatt', 'projekt', 'theorie']

async function seed() {
  await initDb()
  const fach = await prisma.fach.upsert({
    where: { code: 'informatik-gf' },
    create: { code: 'informatik-gf', name: 'Informatik (GINF)', lehrplanUrl: LEHRPLAN_URL },
    update: { lehrplanUrl: LEHRPLAN_URL },
  })
  let nKomp = 0
  for (const [nummer, name, teilgebiete] of INFORMATIK) {
    const lg = await prisma.lerngebiet.upsert({
      where: { fachId_nummer: { fachId: fach.id, nummer } },
      create: { fachId: fach.id, nummer, name },
      update: { name },
    })
    for (const [code, tgName, kompetenzen] of teilgebiete) {
      let tg = await prisma.teilgebiet.findFirst({ where: { lerngebietId: lg.id, code } })
      tg = tg
        ? await prisma.teilgebiet.update({ where: { id: tg.id }, data: { name: tgName } })
        : await prisma.teilgebiet.create({ data: { lerngebietId: lg.id, code, name: tgName } })
      for (let i = 0; i < kompetenzen.length; i++) {
        const kCode = `${code}.${i + 1}`
        const vorhanden = await prisma.kompetenz.findFirst({ where: { teilgebietId: tg.id, code: kCode } })
        if (vorhanden) await prisma.kompetenz.update({ where: { id: vorhanden.id }, data: { text: kompetenzen[i] } })
        else await prisma.kompetenz.create({ data: { teilgebietId: tg.id, code: kCode, text: kompetenzen[i] } })
        nKomp++
      }
    }
  }
  for (const name of TAGS) {
    await prisma.tag.upsert({ where: { name }, create: { name, status: 'AKTIV' }, update: {} })
  }
  console.log(`Seed ok: Informatik (GINF) mit ${INFORMATIK.length} Lerngebieten, ${nKomp} Kompetenzen, ${TAGS.length} Tags`)
}

seed().then(() => prisma.$disconnect())
