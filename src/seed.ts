import { prisma, initDb } from './db.js'

// Rahmenlehrplan Maturitätsschulen (EDK 2024), Grundlagenfächer,
// jeweils Kapitel 4 «Lerngebiete und fachliche Kompetenzen»
// (Informatik PDF S. 69–70, Physik PDF S. 79–81, Mathematik PDF S. 65–67).
// Kompetenz-Codes (1.2.1 …) sind eigene Zählung — der RLP nummeriert Kompetenzen nicht.
// Überfachliche Marker des RLP ((WP), (DIG), (BNE), (ID), (PB)) sind weggelassen.
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

const PHYSIK: LerngebietDef[] = [
  [1, 'Methoden der Physik', [
    ['1.1', 'Erkennen', [
      'exemplarisch historische Erkenntniswege der Physik nachzeichnen',
      'physikalische Probleme mathematisch lösen und Ergebnisse kritisch prüfen und plausibilisieren',
    ]],
    ['1.2', 'Experimentieren', [
      'Hypothesen aufstellen und Experimente durchführen',
      'mit analogen und digitalen Hilfsmitteln Messungen durchführen und auswerten',
      'mit Grössen, Einheiten und Messunsicherheiten umgehen und Grössenordnungen abschätzen',
      'Laborarbeiten selbständig und kollaborativ durchführen',
    ]],
    ['1.3', 'Kommunizieren', [
      'physikalische Informationen aus mündlichen und schriftlichen Texten, Grafiken, Diagrammen und Formeln entnehmen und mit Vorwissen verknüpfen',
      'Beschreibungen, Erklärungen und Informationen gestalten mittels Kombination von verschiedenen Darstellungen und folgerichtiger Anordnung von Argumenten',
      'die mathematische Sprache für Präzisierungen verwenden',
    ]],
  ]],
  [2, 'Kräfte und Bewegungen', [
    ['2.1', 'Kräfte und Bewegungen', [
      'das Prinzip der Trägheit anhand alltäglicher Beispiele illustrieren',
      'gleichförmige und beschleunigte Bewegungen durch Messung erfassen, fachsprachlich beschreiben und in Diagrammen und formal darstellen',
      'gleichförmige und beschleunigte Bewegungen quantitativ beschreiben und hinsichtlich der wirkenden Kräfte erklären',
    ]],
    ['2.2', 'Gravitation', [
      'Bewegungen von Himmelskörpern und Satelliten mit Hilfe des Gravitationsgesetzes näherungsweise beschreiben und berechnen',
      'eine angemessene Auswahl astronomischer Erscheinungen beschreiben und erklären',
    ]],
  ]],
  [3, 'Materie und Energie', [
    ['3.1', 'Materie', [
      'physikalische Eigenschaften und thermische Zustände der Materie qualitativ und quantitativ beschreiben',
      'Änderungen der thermischen Zustände von Materie aus makroskopischer und mikroskopischer Perspektive beschreiben und erklären',
    ]],
    ['3.2', 'Energie', [
      'Energieformen, Energieumwandlungen und Energietransportarten identifizieren und Energiebilanzen aufstellen',
      'mit Hilfe des Energieerhaltungssatzes argumentieren und diesen zur rechnerischen Problemlösung einsetzen',
      'Leistungs- und Energieabschätzungen in überfachlichen Fragestellungen vornehmen',
    ]],
  ]],
  [4, 'Elektrizität und Magnetismus', [
    ['4.1', 'Elektrische Ladungen und Ströme', [
      'die Wechselwirkung zwischen elektrisch geladenen Körpern beschreiben',
      'elektrische Bauteile eines einfachen Schaltkreises benennen und zugehörige Grössen messen und berechnen',
      'verschiedene Arten zur Bereitstellung von Elektrizität erklären und deren Eigenschaften benennen',
      'Gefahren im Umgang mit Elektrizität einschätzen',
    ]],
    ['4.2', 'Magnete und bewegte Ladungen', [
      'die Wechselwirkungen zwischen Magneten qualitativ beschreiben und die Eigenschaften mit Hilfe von Modellen erklären',
      'magnetische Wechselwirkungen mittels Magnetfeldern beschreiben',
      'das Verhalten bewegter Ladungen im Magnetfeld bestimmen und vorhersagen',
      'elektromagnetische Phänomene und Anwendungen benennen und erklären',
    ]],
  ]],
  [5, 'Schwingungen und Wellen', [
    ['5.1', 'Mechanische Schwingungen und Wellen', [
      'Schwingungen mit Fachbegriffen beschreiben und wichtige Grössen messen und berechnen',
      'die Wellenausbreitung mit Fachbegriffen beschreiben und quantifizieren',
      'Interferenzphänomene wahrnehmen und erklären',
    ]],
    ['5.2', 'Schall und Licht', [
      'akustische Phänomene als Wellenphänomene wahrnehmen und beschreiben',
      'Phänomene der Wellenoptik wahrnehmen und erklären',
    ]],
  ]],
  [6, 'Raum, Zeit, Quanten', [
    ['6.1', 'Licht als Teilchen', [
      'an Beispielen den Teilchencharakter des Lichts erklären',
    ]],
    ['6.2', 'Ausgewählter Aspekt moderner Physik', [
      'an einem ausgewählten Beispiel den Übergang von klassischer zu moderner Physik und den damit verbundenen Paradigmenwechsel skizzieren',
    ]],
  ]],
]

const MATHEMATIK: LerngebietDef[] = [
  [1, 'Arithmetik und Algebra (Zahl, Variable, Grössen und Operationen)', [
    ['1.1', 'Zahlen', [
      'natürliche, ganze, rationale und reelle Zahlen charakterisieren, mit ihnen rechnen und ihre Eigenschaften benennen',
    ]],
    ['1.2', 'Termumformungen, Rechnen mit Variablen', [
      'Sachzusammenhänge formalisieren und in Termen ausdrücken',
      'die Struktur von algebraischen Termen analysieren und die entsprechenden Rechengesetze bei Umformungen anwenden',
    ]],
    ['1.3', 'Gleichungen', [
      'Sachzusammenhänge formalisieren und in Gleichungen und Gleichungssystemen ausdrücken',
      'verschiedene Arten von Gleichungen, Ungleichungen und Gleichungssysteme lösen',
    ]],
  ]],
  [2, 'Analysis (Funktionale Zusammenhänge)', [
    ['2.1', 'Funktionen', [
      'den Begriff der Funktion definieren, charakterisieren und verschiedene Darstellungsformen anwenden',
      'die Eigenschaften von elementaren Funktionen beschreiben und flexibel damit umgehen',
      'aus Grundfunktionen mittels Operationen zusammengesetzte Funktionen konstruieren und ihre spezifischen Eigenschaften erklären und anwenden',
      'Zusammenhänge und Abhängigkeiten aus verschiedenen Gebieten mit Funktionen modellieren',
      'das asymptotische Verhalten von Funktionen untersuchen',
    ]],
    ['2.2', 'Differenzialrechnung', [
      'den Begriff der Ableitung einer Funktion auf verschiedene Art und Weise interpretieren',
      'Funktionen ableiten',
      'charakteristische Eigenschaften von Funktionen und ihren Graphen mit den Instrumenten der Differenzialrechnung analysieren',
      'die Differenzialrechnung zum Lösen von Extremwertproblemen nutzen',
    ]],
    ['2.3', 'Integralrechnung', [
      'die Bedeutung und Interpretation des bestimmten Integrals formulieren',
      'Stammfunktionen einer Funktion bestimmen',
      'die Verbindung zwischen Ableitung und Integral mit Hilfe des Hauptsatzes der Differential- und Integralrechnung herstellen',
      'die Integralrechnung zum Lösen von Problemen in verschiedenen Bereichen nutzen',
    ]],
  ]],
  [3, 'Geometrie (Form und Raum)', [
    ['3.1', 'Elementargeometrie', [
      'die verschiedenen Elemente der Geometrie in der Ebene und im Raum berechnen und in Beziehung setzen',
    ]],
    ['3.2', 'Trigonometrie', [
      'die trigonometrischen Verhältnisse und Beziehungen definieren und ihre Eigenschaften beschreiben',
      'fehlende Grössen in rechtwinkligen und allgemeinen Dreiecken mit Hilfe der Trigonometrie berechnen',
      'mit den Instrumenten der Trigonometrie Probleme aus verschiedenen Bereichen lösen',
    ]],
    ['3.3', 'Vektorgeometrie', [
      'Eigenschaften von Vektoren erklären',
      'Vektoren zeichnerisch und rechnerisch anwenden',
      'die Werkzeuge der Vektorgeometrie insbesondere für geometrische Berechnungen anwenden',
      'geometrische Objekte mit Hilfe verschiedener Darstellungen beschreiben und deren gegenseitige Lage analysieren',
      'geometrische Probleme algebraisch formulieren und lösen',
    ]],
  ]],
  [4, 'Stochastik (Daten und Zufall)', [
    ['4.1', 'Kombinatorik', [
      'Zählprinzipien und kombinatorische Formeln unterscheiden und situationsgerecht benutzen',
      'kombinatorische Probleme lösen',
    ]],
    ['4.2', 'Wahrscheinlichkeit', [
      'Begriffe der Wahrscheinlichkeitsrechnung erklären und ihre Eigenschaften beschreiben und benützen',
      'die Wahrscheinlichkeitsrechnung mit ihren Regeln einsetzen, um verschiedene Aufgabenstellungen mit Zufallsexperimenten zu analysieren und zu lösen',
    ]],
    ['4.3', 'Statistik', [
      'statistische Kennzahlen kennen und berechnen',
      'Daten mit Grafiken und geeigneten Kennzahlen beschreiben und interpretieren',
    ]],
  ]],
]

// Kantonaler Fachlehrplan Aargau, Schwerpunktfach «Informatik und ihre Anwendungen»
// (ab Schuljahr 2027/28), Kapitel 5 «Lerngebiete und fachliche Kompetenzen».
// Überfachliche Marker ((ID), (WP), (PB), (BNE)) wie oben weggelassen.
const INFORMATIK_SPF_AG: LerngebietDef[] = [
  [1, 'Algorithmen und Programmierung', [
    ['1.1', 'Programmierkonzepte', [
      'grundlegende Programmierkonzepte (z.B. Kontrollstrukturen, Variablen, Funktionen) kompetent anwenden',
      'Programmierkonzepte und -paradigmen (z.B. Objektorientierung, Modularisierung, Rekursion) nennen, unterscheiden, vergleichen und anwenden',
      'geeignete Datenstrukturen zur Implementierung von Programmen auswählen und einsetzen',
    ]],
    ['1.2', 'Algorithmik', [
      'gegebene Algorithmen analysieren und beurteilen',
      'algorithmische Lösungen für konkrete Problemstellungen entwickeln',
      'klassische algorithmische Strategien (z.B. Greedy, Teile-und-Herrsche, Backtracking) für den Entwurf eigener Lösungen einbeziehen',
    ]],
    ['1.3', 'Theoretische Informatik', [
      'Algorithmen auf ihre Laufzeitkomplexität untersuchen',
      'Grenzen der Automatisierung auf Basis grundlegender Konzepte der Berechenbarkeitstheorie (z.B. Turingmaschine, endliche Automaten, formale Sprachen) einschätzen',
    ]],
    ['1.4', 'Technische Grundlagen', [
      'die technischen Hintergründe ausgewählter Themenbereiche (z.B. Datenspeicherung, Netzwerktechnik, Microcontroller, Sensorik) erklären',
      'technisches Grundwissen gezielt einsetzen, bspw. zur Auswahl geeigneter Software, Geräte bzw. Bauteile oder zur Beurteilung von Anwendungsgebiet, Leistungsfähigkeit oder Sicherheit eines Geräts bzw. Systems',
    ]],
    ['1.5', 'Software-Engineering', [
      'eigene Softwareprojekte planen, durchführen und auswerten, ggf. in Teams',
      'Projektsteuerungskonzepte (z.B. Wasserfallmodell, iterativ, test-driven, agile) unterscheiden, erklären und zielgerichtet anwenden',
      'übliche Methoden der Softwareindustrie (z.B. unit testing, version control, AI-agents) gezielt auswählen und für eigene Projekte einsetzen',
    ]],
  ]],
  [2, 'Informationen, Daten und Modelle', [
    ['2.1', 'Daten', [
      'Organisationsformen von Daten unterscheiden und vergleichen (z.B. Kosten, Aufwand, Vor- und Nachteile)',
      'eine passende Organisationsform für konkrete Datenverarbeitungsvorhaben wählen und einsetzen',
      'Datensätze selektieren, aufbereiten und bereinigen',
      'ausgewählte Aspekte von Datensicherheit und Verschlüsselung in realen Anwendungen untersuchen',
    ]],
    ['2.2', 'Modelle', [
      'Bedeutung von und Unterschiede zwischen Daten bzw. Information diskutieren',
      'reale Sachverhalte, Informationen und Interaktionen in virtuelle Modelle (z.B. Variablen, Funktionen, Objekte, Entitäten) überführen',
      'Zweck, Vor- und Nachteile sowie Grenzen informatischer Modellierung diskutieren',
    ]],
    ['2.3', 'Künstliche Intelligenz', [
      'verschiedene Herangehensweisen an die automatisierte Verarbeitung von Daten (insb. klassische KI vs. maschinelles Lernen) unterscheiden und vergleichen',
      'wesentliche Mechanismen und Problematiken des maschinellen Lernens erklären (z.B. Generalisierung, Backpropagation, Gradient Descent, Bias, Overfitting)',
      'ein selbstlernendes System anhand beispielhafter Daten trainieren und die Resultate evaluieren',
      'die Verarbeitung von Information im Kontext moderner KI-Systeme diskutieren',
    ]],
  ]],
  [3, 'Anwendungen der Informatik', [
    ['3.1', 'Gegebene Anwendungen', [
      'sich einen Überblick über Anwendungen zu einem spezifischen Fach- bzw. Themengebiet verschaffen',
      'vertiefte Einblicke in ausgewählte Anwendungen gewinnen und als Grundlage für weitere Recherchen oder praktische Umsetzungen nutzen',
      'funktionale und thematische Kernaspekte ausgewählter Anwendungen identifizieren',
      'zukünftige Entwicklungen von Anwendungen diskutieren',
    ]],
    ['3.2', 'Theoretische Hintergründe', [
      'anwendungs- bzw. fachspezifische theoretische und technische Hintergründe identifizieren und für die Beurteilung von Anwendungen einsetzen',
      'Bezüge zwischen einer bestimmten Anwendung und zugrundeliegender Informatiktheorie herstellen',
      'die Rolle der Informatik in Bezug auf eine bestimmte Anwendung spezifizieren',
    ]],
    ['3.3', 'Praktische Umsetzung', [
      'anwendungsspezifische Anforderungen an zugehörige Daten identifizieren',
      'angemessene Daten beschaffen, produzieren und/oder aufbereiten',
      'ein Projekt im Kontext des behandelten Anwendungsbereichs umsetzen oder anpassen',
      'aus dem Projekt angemessene Erkenntnisse ableiten und kritisch evaluieren',
    ]],
  ]],
  [4, 'Informatik/Technologie und Gesellschaft', [
    ['4.1', 'Wissenschaftsmethodik', [
      'wissenschaftlichen Erkenntnisgewinn als Wechselspiel zwischen Evidenz und Theorie erklären',
      'die Rolle von Informatikanwendungen im Kontext des wissenschaftlichen Erkenntnisgewinns abschätzen',
      'Simulationen und Modelle kritisch bewerten sowie Unsicherheiten und Grenzen erkennen',
    ]],
    ['4.2', 'Auswirkungen von Digitalität', [
      'sich kritisch mit den Auswirkungen der Digitalisierung auf Gesellschaft, Wissenschaft und persönliches Leben auseinandersetzen',
      'die Chancen und Gefahren ausgewählter digitaler Innovationen in Bezug auf Aspekte wie Effizienz, Ressourcenverbrauch, Skalierungseffekte, Privatsphäre, Datensicherheit, persönliche und gesellschaftliche Entwicklung beurteilen',
      'aktuelle Entwicklungen der Informationsgesellschaft (z.B. Künstliche Intelligenz, Quantencomputer, Bionik, Blockchain) erkennen und hinterfragen',
    ]],
  ]],
]

const SPF_AG_URL = 'https://www.ag.ch/de/medien/medienmitteilungen?mm=aargauer-gymnasium-ab-2027-28-neu-aufgestellt-8398f540-efa7-48f9-bdc3-1623bd0e47ad_de'

interface FachDef { code: string; kuerzel: string; name: string; url: string | null; lerngebiete: LerngebietDef[] }
const DISZIPLINEN: { code: string; name: string; faecher: FachDef[] }[] = [
  { code: 'informatik', name: 'Informatik', faecher: [
    { code: 'informatik-gf', kuerzel: 'Ginf', name: 'Grundlagenfach Informatik', url: LEHRPLAN_URL, lerngebiete: INFORMATIK },
    { code: 'informatik-spf-ag', kuerzel: 'Sinf AG', name: 'Schwerpunktfach «Informatik und ihre Anwendungen» (Kanton AG)', url: SPF_AG_URL, lerngebiete: INFORMATIK_SPF_AG },
  ] },
  { code: 'physik', name: 'Physik', faecher: [{ code: 'physik-gf', kuerzel: 'Gphy', name: 'Grundlagenfach Physik', url: LEHRPLAN_URL, lerngebiete: PHYSIK }] },
  { code: 'mathematik', name: 'Mathematik', faecher: [{ code: 'mathematik-gf', kuerzel: 'Gmat', name: 'Grundlagenfach Mathematik', url: LEHRPLAN_URL, lerngebiete: MATHEMATIK }] },
]

const TAGS = ['python', 'java', 'robotik', 'blender', 'spielerisch', 'formell', 'unplugged', 'arbeitsblatt', 'projekt', 'theorie', 'experiment', 'simulation', 'video']

async function seed() {
  await initDb()
  for (const disziplinDef of DISZIPLINEN) {
    const disziplin = await prisma.disziplin.upsert({
      where: { code: disziplinDef.code },
      create: { code: disziplinDef.code, name: disziplinDef.name },
      update: { name: disziplinDef.name },
    })
    for (const def of disziplinDef.faecher) {
    const fach = await prisma.fach.upsert({
      where: { code: def.code },
      create: { code: def.code, kuerzel: def.kuerzel, name: def.name, url: def.url, disziplinId: disziplin.id },
      update: { kuerzel: def.kuerzel, name: def.name, url: def.url, disziplinId: disziplin.id },
    })
    let nKomp = 0
    for (const [nummer, name, teilgebiete] of def.lerngebiete) {
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
    console.log(`Seed ok: ${def.kuerzel} ${def.name} mit ${def.lerngebiete.length} Lerngebieten, ${nKomp} Kompetenzen`)
    }
  }
  for (const name of TAGS) {
    await prisma.tag.upsert({ where: { name }, create: { name, status: 'AKTIV' }, update: {} })
  }
  console.log(`Seed ok: ${TAGS.length} Tags`)
}

seed().then(() => prisma.$disconnect())
