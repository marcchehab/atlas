import fs from 'node:fs'
import path from 'node:path'
import { esc } from './views.js'

// Niveau-Score: fachliches Anspruchsniveau 1–100, getrennt vom Didaktik-Score. Passung, kein
// Qualitätsurteil. Die Skala ist fachneutral an der Bildungsstufe verankert; pro Disziplin
// konkretisieren Fach-Anker aus niveau/<disziplin-code>.md die Bänder. Die Anker wurden einmalig
// mit KI aus öffentlichen Belegen hergeleitet (Prüfungen, Wettbewerbe, Lehrpläne, Uni-Übungen).

// Die Bandnamen folgen den Fach-Ankern in niveau/<disziplin>.md. «Übergang» hiess das zweite Band
// früher; der Name und die Beschreibung («nur an Beispielen nachvollzogen») zogen gymnasiale
// Routine — umrechnen, Code nachvollziehen — fälschlich unter das Grundlagenfach. Das zweite Band
// ist die Sek I an ihrem oberen Ende, nicht ein abgeschwächtes Gymnasium.
export const NIVEAU_BAENDER: [number, string, string][] = [
  [1, 'Sek I', 'Phänomene und Begriffe beschreiben, Rezepte anwenden, kaum Voraussetzungen'],
  [21, 'Sek I erweitert', 'oberes Ende der Sek I und Progymnasium: erste Schritte in einem Gymnasialthema, spielerisch oder nach Vorlage'],
  [41, 'Grundlagenfach', 'Kern des gymnasialen Grundlagenfachs, von der Routine bis zur begründeten Anwendung mit Transfer'],
  [61, 'Schwerpunktfach', 'Schwerpunkt- und Ergänzungsfach, Olympiade, Maturaarbeit: Herleitungen, Formalisierung, offene Probleme'],
  [81, 'Hochschule', 'formale Theorie, setzt Maturitätswissen voraus'],
]
export const niveauBandName = (n: number) => [...NIVEAU_BAENDER].reverse().find(([von]) => n >= von)![1]

// Fachneutraler Teil des Bewertungs-Prompts; die Fach-Anker werden pro Disziplin angehängt
export const NIVEAU_PROMPT = `niveau 1–100: Für welche Bildungsstufe ist der Inhalt FACHLICH gemacht? Unabhängig von der didaktischen Qualität und vom Layout.
   Kriterien: vorausgesetztes Vorwissen, Abstraktion/Formalisierung, Tiefe (Phänomen → Modell → Herleitung), Anforderung der Aufgaben (Reproduktion / Anwendung / Transfer, Begründung, Beweis).
   Bänder (innerhalb eines Bands graduell abstufen):
${NIVEAU_BAENDER.map(([von, name, kurz], i) => `   ${von}–${(NIVEAU_BAENDER[i + 1]?.[0] ?? 101) - 1} ${name}: ${kurz}.`).join('\n')}
   Massgebend ist, was das Material verlangt, nicht welches Thema es behandelt.
   Stufe genau ab und nutze die ganze Breite eines Bands: z.B. 42 = Einstieg ins Grundlagenfach, 50 = typischer Grundlagenfach-Stoff, 58 = anspruchsvoller Grundlagenfach-Stoff an der Grenze zum Schwerpunktfach. Keine runden Standardwerte.`

// ---- Kriterienkatalog -------------------------------------------------------------------------
// Statt einer blossen Zahl erfasst die KI, welche Taetigkeiten aus einem geschlossenen Katalog im
// Material vorkommen und wie zentral (Gewicht 1-3). Der Niveau-Score ist daraus der gewichtete
// Median. Vorteil gegenueber der direkten Zahl: das Niveau einer Taetigkeit ist Daten, nicht
// Modellausgabe — es laesst sich spaeter per Voting korrigieren und neu rechnen, ohne zu crawlen.
// Gemessen (GLM 5.3 Flash, Belege der Anker): Band exakt 78 % statt 73 %, Streuung zwischen zwei
// Laeufen 1.5 statt 4.2 Punkte. Feuert kein Kriterium, faellt der Crawler auf die Zahl zurueck.

export interface Kriterium {
  id: string // fix; daran haengen spaeter die Stimmen
  niveau: number // 1-100, Startwert aus den Ankern
  text: string
  gruppe: string
}

const kriterienCache = new Map<string, Kriterium[] | null>()

// niveau/kriterien-<code>.md: Zeilen «- `id` | niveau | Taetigkeit», ##-Ueberschriften als Gruppe.
// Fehlt die Datei, hat die Disziplin keinen Katalog und wird nur mit der direkten Zahl bewertet.
export function fachKriterien(disziplinCode: string): Kriterium[] | null {
  if (kriterienCache.has(disziplinCode)) return kriterienCache.get(disziplinCode)!
  let md: string
  try { md = fs.readFileSync(path.join(ANKER_DIR, `kriterien-${disziplinCode}.md`), 'utf8') } catch { kriterienCache.set(disziplinCode, null); return null }
  const ks: Kriterium[] = []
  let gruppe = ''
  for (const z of md.split('\n')) {
    if (z.startsWith('## ')) gruppe = z.slice(3).trim()
    const m = z.match(/^- `([a-z0-9-]+)` \| (\d+) \| (.+)$/)
    if (m) ks.push({ id: m[1], niveau: Math.max(1, Math.min(100, +m[2])), text: m[3].trim(), gruppe })
  }
  const res = ks.length ? ks : null
  kriterienCache.set(disziplinCode, res)
  return res
}

export interface KriteriumTreffer { id: string; gewicht: number }

// Wirksames Niveau einer Taetigkeit: Median aus dem Startwert und den Stimmen der Lehrpersonen.
// Der Startwert zaehlt als eine Stimme mit, damit eine einzelne abweichende Stimme den Wert nicht
// kippt; ab zwei uebereinstimmenden Stimmen setzt sich die Community durch.
export function wirksamesNiveau(startwert: number, stimmen: number[]): number {
  const alle = [startwert, ...stimmen].sort((a, b) => a - b)
  const m = Math.floor(alle.length / 2)
  return alle.length % 2 ? alle[m] : Math.round((alle[m - 1] + alle[m]) / 2)
}

// Katalog mit eingerechneten Stimmen. `stimmenNach` bildet kriteriumId auf die abgegebenen
// Niveau-Werte ab (aus der Tabelle KriteriumStimme).
export function katalogMitStimmen(katalog: Kriterium[], stimmenNach: Map<string, number[]>): Kriterium[] {
  return katalog.map((k) => {
    const st = stimmenNach.get(k.id)
    return st?.length ? { ...k, niveau: wirksamesNiveau(k.niveau, st) } : k
  })
}

// Gewichteter Median: Kriterien nach Niveau sortieren, Gewichte aufsummieren, den Wert nehmen, bei
// dem die halbe Gewichtssumme erreicht ist. Der Median statt des Mittels, weil ein Material sein
// Niveau von seinem Schwerpunkt bekommen soll und nicht von Randthemen verwaessert werden darf;
// eine blosse Summe waere falsch, sie waechst mit der Materiallaenge.
export function berechneNiveau(treffer: KriteriumTreffer[], katalog: Kriterium[]): number | null {
  const nach = new Map(katalog.map((k) => [k.id, k.niveau]))
  const paare = treffer
    .filter((t) => nach.has(t.id) && t.gewicht > 0)
    .map((t) => ({ niveau: nach.get(t.id)!, gewicht: Math.min(3, Math.max(1, Math.round(t.gewicht))) }))
    .sort((a, b) => a.niveau - b.niveau)
  if (!paare.length) return null
  const gesamt = paare.reduce((s, p) => s + p.gewicht, 0)
  let kum = 0
  for (const p of paare) { kum += p.gewicht; if (kum >= gesamt / 2) return p.niveau }
  return paare[paare.length - 1].niveau
}

// Woher der angezeigte Niveau-Score kommt. Beide Werte werden immer gespeichert (Material.niveau
// und Material.niveauKi), das hier entscheidet nur, welcher angezeigt wird.
//
// 'kombiniert' (Standard, entschieden 1.10.2026 nach Vergleich an 9'226 Materialien): Die direkte
// KI-Zahl stuft Programmiermaterial zu tief ein und hat Ausreisser (PyTamaro: 1); der Katalog liegt
// dort besser, kippt aber, wenn nur ein einzelnes, falsch erkanntes Item feuert (Biber → «Olympiade»).
//   ≥ 2 verschiedene Items → Katalog-Wert
//   genau 1 Item           → Mittel aus Katalog und KI
//   kein Item              → KI-Zahl
// Umstellen ändert nur die Anzeige; `npx tsx scripts/niveau-neu-rechnen.ts --schreiben` rechnet ohne Crawl neu.
export type NiveauQuelle = 'ki' | 'kriterien' | 'kombiniert'
export const NIVEAU_QUELLE: NiveauQuelle = (process.env.NIVEAU_QUELLE as NiveauQuelle) ?? 'kombiniert'

export function niveauScore(treffer: KriteriumTreffer[], katalog: Kriterium[], niveauKi: number, quelle: NiveauQuelle = NIVEAU_QUELLE): number {
  if (quelle === 'ki') return niveauKi
  const kat = berechneNiveau(treffer, katalog)
  if (kat == null) return niveauKi
  if (quelle === 'kriterien') return kat
  const ids = new Set(treffer.filter((t) => katalog.some((k) => k.id === t.id)).map((t) => t.id))
  return ids.size >= 2 ? kat : Math.round((kat + niveauKi) / 2)
}

// Prompt-Teil fuer die Kriterien-Erfassung; der Katalog selbst wird in ai.ts angehaengt.
export const KRITERIEN_PROMPT = `kriterien: Welche Taetigkeiten aus dem Katalog unten kommen im Material vor? Gib nur die zutreffenden ids zurueck, je mit einem Gewicht:
   3 = zentral, das Material dreht sich darum
   2 = deutlich vorhanden, ein eigener Abschnitt oder mehrere Aufgaben
   1 = am Rande erwaehnt oder nur ein kurzer Nebenaspekt
   Massgebend ist, was das Material die Lernenden tun laesst oder vormacht, nicht welches Thema es nennt: ein Text ueber Sortierverfahren ohne jede Analyse erfuellt «Verfahren vergleichen» nicht. Unterscheide die Anforderung — Code nur nachvollziehen ist etwas anderes als Code selbst entwerfen.
   Nur bewerten, was im Text selbst steht, nicht was verlinkt oder angekuendigt wird. Lieber wenige treffende ids als viele vage; typisch sind 2-6. Passt nichts, gib eine leere Liste zurueck.`

export interface FachAnker {
  anker: string // Prompt-Text: eine Zeile pro Anker, «von–bis Band: …»
  abschnitte: { titel: string; markdown: string }[] // Belege, Kalibrierfälle, Methodik
}

const ANKER_DIR = path.join(process.cwd(), 'niveau')
const cache = new Map<string, FachAnker | null>()

// Der Anker-Text wird aus den Kriterien erzeugt: eine Zeile pro Band, die Tätigkeiten nach Niveau
// sortiert. Damit gibt es nur eine Quelle — wer ein Item verschiebt oder umformuliert, ändert
// zugleich den Prompt. Nur Disziplinen ohne Katalog fallen auf einen von Hand geschriebenen
// «## Anker»-Abschnitt in niveau/<code>.md zurück.
export function ankerAusKriterien(kriterien: Kriterium[]): string {
  return NIVEAU_BAENDER.map(([von, name], i) => {
    const bis = (NIVEAU_BAENDER[i + 1]?.[0] ?? 101) - 1
    const drin = kriterien.filter((k) => k.niveau >= von && k.niveau <= bis).sort((a, b) => a.niveau - b.niveau)
    return drin.length ? `${von}–${bis} ${name}: ${drin.map((k) => k.text).join('; ')}.` : ''
  }).filter(Boolean).join('\n')
}

// niveau/<code>.md: alle ##-Abschnitte erscheinen auf /niveau (Belege, Kalibrierfälle, Methodik).
// Der Prompt-Anker kommt aus niveau/kriterien-<code>.md; fehlt der Katalog, greift ein von Hand
// geschriebener «## Anker»-Abschnitt. Fehlt beides, ist die Disziplin «unkalibriert».
export function fachAnker(disziplinCode: string): FachAnker | null {
  if (cache.has(disziplinCode)) return cache.get(disziplinCode)!
  let md = ''
  try { md = fs.readFileSync(path.join(ANKER_DIR, `${disziplinCode}.md`), 'utf8') } catch { /* nur Katalog, keine Belege */ }
  const teile = md.split(/^## /m).slice(1).map((t) => {
    const nl = t.indexOf('\n')
    return { titel: t.slice(0, nl).trim(), markdown: t.slice(nl + 1).trim() }
  })
  const ankerTeil = teile.find((t) => t.titel.startsWith('Anker'))
  const ks = fachKriterien(disziplinCode)
  const anker = ks ? ankerAusKriterien(ks) : ankerTeil?.markdown
  const res = anker ? { anker, abschnitte: teile.filter((t) => t !== ankerTeil) } : null
  cache.set(disziplinCode, res)
  return res
}

// Minimal-Markdown für die Anker-Dateien: ###-Überschriften, Listen, Absätze, [Links](url), **fett**, `code`
function inline(s: string): string {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => `<a href="${u}" rel="noopener">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}
export function mdZuHtml(md: string): string {
  const out: string[] = []
  let liste = false
  for (const zeile of md.split('\n')) {
    const z = zeile.trim()
    const li = z.match(/^[-*] (.*)/)
    if (!li && liste) { out.push('</ul>'); liste = false }
    if (li) { if (!liste) { out.push('<ul>'); liste = true } out.push(`<li>${inline(li[1])}</li>`) }
    else if (z.startsWith('### ')) out.push(`<h4>${inline(z.slice(4))}</h4>`)
    else if (z) out.push(`<p>${inline(z)}</p>`)
  }
  if (liste) out.push('</ul>')
  return out.join('\n')
}
