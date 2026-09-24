import fs from 'node:fs'
import path from 'node:path'
import { esc } from './views.js'

// Niveau-Score: fachliches Anspruchsniveau 1–100, getrennt vom Didaktik-Score. Passung, kein
// Qualitätsurteil. Die Skala ist fachneutral an der Bildungsstufe verankert; pro Disziplin
// konkretisieren Fach-Anker aus niveau/<disziplin-code>.md die Bänder. Die Anker wurden einmalig
// mit KI aus öffentlichen Belegen hergeleitet (Prüfungen, Wettbewerbe, Lehrpläne, Uni-Übungen).

export const NIVEAU_BAENDER: [number, string, string][] = [
  [1, 'Sek I', 'Phänomene und Begriffe beschreiben, Rezepte anwenden, kaum Voraussetzungen'],
  [21, 'Übergang', 'Gymnasialstoff, aber nur an Beispielen nachvollzogen, ohne Verallgemeinerung oder Begründung'],
  [41, 'Gymnasium GF', 'Kern des Grundlagenfachs: Konzepte allgemein erklärt, angewandt und begründet, Aufgaben verlangen Transfer'],
  [61, 'Gymnasium vertieft', 'Schwerpunkt-/Ergänzungsfach, Olympiade, Maturaarbeit: Herleitungen, Formalisierung, offene Probleme'],
  [81, 'Hochschule', 'formale Theorie, setzt Maturitätswissen voraus'],
]
export const niveauBandName = (n: number) => [...NIVEAU_BAENDER].reverse().find(([von]) => n >= von)![1]

// Fachneutraler Teil des Bewertungs-Prompts; die Fach-Anker werden pro Disziplin angehängt
export const NIVEAU_PROMPT = `niveau 1–100: Für welche Bildungsstufe ist der Inhalt FACHLICH gemacht? Unabhängig von der didaktischen Qualität und vom Layout.
   Kriterien: vorausgesetztes Vorwissen, Abstraktion/Formalisierung, Tiefe (Phänomen → Modell → Herleitung), Anforderung der Aufgaben (Reproduktion / Anwendung / Transfer, Begründung, Beweis).
   Bänder (innerhalb eines Bands graduell abstufen):
${NIVEAU_BAENDER.map(([von, name, kurz], i) => `   ${von}–${(NIVEAU_BAENDER[i + 1]?.[0] ?? 101) - 1} ${name}: ${kurz}.`).join('\n')}
   Massgebend ist, was das Material verlangt, nicht welches Thema es behandelt. Im Zweifel das tiefere Band.`

export interface FachAnker {
  anker: string // Prompt-Text: eine Zeile pro Anker, «von–bis Band: …»
  abschnitte: { titel: string; markdown: string }[] // Belege, Kalibrierfälle, Methodik
}

const ANKER_DIR = path.join(process.cwd(), 'niveau')
const cache = new Map<string, FachAnker | null>()

// niveau/<code>.md: «## Anker (Prompt-Text)» liefert den Prompt-Text, alle weiteren ##-Abschnitte
// erscheinen auf /niveau. Fehlt die Datei, ist die Disziplin «unkalibriert» (nur allgemeine Skala).
export function fachAnker(disziplinCode: string): FachAnker | null {
  if (cache.has(disziplinCode)) return cache.get(disziplinCode)!
  let md: string
  try { md = fs.readFileSync(path.join(ANKER_DIR, `${disziplinCode}.md`), 'utf8') } catch { cache.set(disziplinCode, null); return null }
  const teile = md.split(/^## /m).slice(1).map((t) => {
    const nl = t.indexOf('\n')
    return { titel: t.slice(0, nl).trim(), markdown: t.slice(nl + 1).trim() }
  })
  const ankerTeil = teile.find((t) => t.titel.startsWith('Anker'))
  const res = ankerTeil ? { anker: ankerTeil.markdown, abschnitte: teile.filter((t) => t !== ankerTeil) } : null
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
