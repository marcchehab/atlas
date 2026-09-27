import { NIVEAU_PROMPT, KRITERIEN_PROMPT, Kriterium, KriteriumTreffer } from './niveau.js'

export interface Klassifikation {
  qualityScore: number // 0–100; <20 = nicht aufgenommen
  niveau: number // direkte Schätzung 1–100 (fachliches Anspruchsniveau, siehe niveau.ts)
  kriterien: KriteriumTreffer[] // Tätigkeiten aus dem Katalog; leer, wenn die Disziplin keinen hat
  titel: string
  zusammenfassung: string
  zuordnungen: string[] // Codes: "T:<fach>:1.2" (ganzes Teilgebiet) oder "K:<fach>:1.2.1" (einzelne Kompetenz)
  tags: string[]
  neueTagVorschlaege: string[]
}

// Auswahlliste fürs erzwungene Enum: Teilgebiete und Kompetenzen des Fachs.
export interface ZuordnungsOption {
  code: string // "T:<fach>:1.2" | "K:<fach>:1.2.1"
  label: string
}

// Modellwahl per Eval auf den Anker-Belegen (scripts/model-eval.ts, Sept. 2026): GLM 5.3 Flash traf das
// Band wie GPT-6 Luna, mit bester Rangkorrelation und ohne Ausfälle; Reasoning ist dort Pflicht (low reicht)
export const MODEL = process.env.AI_MODEL ?? 'z-ai/glm-5.3-flash'
export const MODELL_NAME = 'GLM 5.3 Flash (Z.ai)'

// Bewertungskriterien für den Didaktik-Score — Teil des Prompts und wörtlich auf /sortierung veröffentlicht
export const SCORE_PROMPT = `1. qualityScore 0–100: Taugt das als Unterrichtsmaterial fürs Gymnasium, und wie gut?
   Gutes Material erklärt zuerst anschaulich und intuitiv, dann erst formal, zeigt gute Beispiele und lässt die Schüler:innen mit Aufgaben und Lösungen selbst arbeiten. Und es begeistert: spielerisch, überraschend, lustig, mit echtem Bezug zur Welt der Schüler:innen. Gute Übungen sind wertvoll, werte Übungsblätter nicht ab. Entscheidend ist, ob die Aufgaben interessant und spannend sind oder Routine.
   Auch ein gutes Werkzeug kann sehr gut bewertet werden: interaktive Simulatoren, Rechner, Editoren oder Spiele, mit denen Schüler:innen etwas ausprobieren und verstehen (z.B. ein Little-Man-Computer-Simulator), gehören in die oberen Bänder, auch wenn sie wenig erklärenden Text enthalten. Erkenne Werkzeuge auch an Bedienelementen und Beschreibungen, nicht nur an Erklärtext.
   Bewerte nur, was im Text selbst steht, nicht was verlinkt oder angekündigt wird.
   Bänder (innerhalb eines Bands graduell abstufen):
   0–20 untauglich: kein Unterrichtsinhalt — Navigation, Portal, Index, Impressum, Linkliste, Fragment — oder didaktisch unbrauchbar: fachlich falsch, wirr, unverständlich. Das gilt auf jedem Niveau; ein Material für eine andere Stufe ist deswegen nicht untauglich (dafür gibt es den Niveau-Score).
   21–40 Rohmaterial: Inhalt vorhanden, aber ohne Einstieg, ohne Beispiele oder ohne Lösungen — Folien, Notizen, nackte Theorie, Aufgaben ohne Lösungen. Nur mit Lehrperson nutzbar.
   41–60 solide: verständlich aufgebaut — Erklärung mit Beispielen oder Übungen mit Lösungen, Begriffe sauber. Funktioniert im Unterricht, ist aber Routine.
   61–80 lebendig: solide, und dazu etwas, das Schülerinnen und Schüler packt — spielerischer Zugang, überraschendes Beispiel, Rätsel, Projekt, Wettbewerb, Humor, interaktives Werkzeug, echter Bezug zu ihrer Welt. Auch ein Übungsblatt, wenn die Aufgaben interessant und spannend sind.
   81–100 begeisternd: didaktisch vollständig — Intuition vor Formalismus, gute Beispiele, gute Aufgaben mit Lösungen, Zusammenfassung oder Selbstcheck — und die Klasse will das machen. Oder ein Werkzeug, mit dem man das Thema selbst erkunden kann. Material, das man Kolleg:innen sofort weiterschickt.`

export const SCORE_BAENDER: [number, string, string][] = [
  [0, 'untauglich', 'kein Unterrichtsinhalt (Navigation, Portal, Linkliste) oder didaktisch unbrauchbar'],
  [21, 'Rohmaterial', 'Inhalt ohne Einstieg, Beispiele oder Lösungen, braucht die Lehrperson dazu'],
  [41, 'solide', 'verständlich aufgebaut, mit Beispielen oder Übungen und Lösungen'],
  [61, 'lebendig', 'packt die Schüler: spielerisch, überraschend, mit Bezug zu ihrer Welt'],
  [81, 'begeisternd', 'didaktisch vollständig und mitreissend, das schickt man Kollegen weiter'],
]
export const bandName = (score: number) => [...SCORE_BAENDER].reverse().find(([von]) => score >= von)![1]

export async function klassifiziere(
  text: string,
  optionen: ZuordnungsOption[],
  tagNamen: string[],
  niveauAnker = '', // Fach-Anker der Disziplinen im Kontext (niveau/<disziplin>.md)
  katalog: Kriterium[] = [] // Kriterienkatalog der Disziplinen im Kontext (niveau/kriterien-<disziplin>.md)
): Promise<Klassifikation> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return mockKlassifikation(text, optionen, tagNamen)

  const anweisung = `Du klassifizierst Unterrichtsmaterial für Schweizer Gymnasien nach Lehrplänen (Rahmenlehrplan 2024 sowie kantonale Fachlehrpläne, z.B. Schwerpunktfächer).

Lehrplan-Raster (T… = ganzes Teilgebiet, K… = einzelne Kompetenz):
${optionen.map((o) => `${o.code}: ${o.label}`).join('\n')}

Erlaubte Tags: ${tagNamen.join(', ')}
Tag-Regeln: Werkzeug-Tags (python, java, blender, robotik …) nur, wenn das Werkzeug im Material aktiv verwendet wird. «theorie» nur für primär theoretische Materialien ohne Übungs-/Praxisteil. «formell» nur bei mathematisch-formaler Darstellung (Definitionen, Beweise, Formeln). «spielerisch» nur bei explizit spielerischem Zugang. Im Zweifel ein Tag weglassen.

Aufgaben:
${SCORE_PROMPT}
2. titel: prägnanter Titel des Materials
3. zusammenfassung: 2–3 Sätze auf Deutsch
4. zuordnungen: abgedeckte Kompetenzen (K…); nur wenn ein Material ein Teilgebiet breit abdeckt, stattdessen dessen T…-Code. Leer, wenn nichts passt. Nur zuordnen, was der Text selbst unterrichtet — nicht, was er bloß erwähnt oder verlinkt. Kompetenzen mit Werkzeug-Bezug (z.B. «mittels Programmierung») nur, wenn dieses Werkzeug im Material tatsächlich eingesetzt wird — ein Tutorial zu einer Kreativ-Software ohne Programmieranteil erfüllt keine Programmier-Kompetenz.
5. tags: passende Tags aus der erlaubten Liste
6. neueTagVorschlaege: meist leer — nur ausnahmsweise max. 2 neue Tags (kleingeschrieben, generisch wiederverwendbar wie die erlaubten Tags), wenn ein zentraler Aspekt durch kein erlaubtes Tag abbildbar ist. Niemals Themen, die im Lehrplan-Raster oben schon vorkommen (z.B. kryptographie, netzwerke, algorithmen, datenbanken — dafür sind die Zuordnungen da). Tags beschreiben Form, Werkzeug oder Zugang, nicht das Thema. Keine Synonyme.
7. ${NIVEAU_PROMPT}${niveauAnker ? `\n   Fach-Anker (Beispiele pro Band; nimm die Anker des Fachs, zu dem das Material gehört):\n${niveauAnker}` : ''}${katalog.length ? `
8. ${KRITERIEN_PROMPT}
   Katalog (id: Tätigkeit):
${katalog.map((k) => `   ${k.id}: ${k.text}`).join('\n')}` : ''}`

  return mitSlot(() => mitRetry(async () => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: MODEL,
        // Antwort ist kurzes JSON, aber das Reasoning braucht Platz; ohne Angabe reserviert OpenRouter das Modell-Maximum
        max_tokens: Number(process.env.AI_MAX_TOKENS) || 8000,
        // Reasoning-Modelle (DeepSeek, Qwen …) verbrauchen sonst das Token-Limit fürs Nachdenken und liefern leer
        ...(process.env.AI_OHNE_REASONING ? { reasoning: { enabled: false } } : {}),
        ...(process.env.AI_OHNE_REASONING ? {} : { reasoning: { effort: process.env.AI_REASONING_EFFORT ?? 'low' } }),
        // Fester Teil (Raster, Tags, Aufgaben) zuerst und mit Cache-Breakpoint, Material zuletzt:
        // gleicher Präfix pro Fach-Kontext → Cache-Treffer zu 0.25× Input-Preis
        messages: [
          { role: 'system', content: [{ type: 'text', text: anweisung, cache_control: { type: 'ephemeral' } }] },
          { role: 'user', content: `Material:\n${text.slice(0, 30000)}` },
        ],
        usage: { include: true },
        // Nur Anbieter, die alle Parameter (json_schema strict, reasoning) können — sonst liefern manche
        // (z.B. Together, OpenInference bei GLM) still eine leere Antwort
        provider: { require_parameters: true, ignore: (process.env.AI_ANBIETER_IGNORIEREN ?? 'OpenInference,Together').split(',').filter(Boolean) },
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'klassifikation',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                qualityScore: { type: 'integer' },
              niveau: { type: 'integer' },
                titel: { type: 'string' },
                zusammenfassung: { type: 'string' },
                zuordnungen: { type: 'array', items: { type: 'string', enum: optionen.map((o) => o.code) } },
                tags: { type: 'array', items: { type: 'string', enum: tagNamen } },
                neueTagVorschlaege: { type: 'array', items: { type: 'string' } },
                ...(katalog.length ? { kriterien: {
                  type: 'array',
                  items: {
                    type: 'object', additionalProperties: false,
                    properties: { id: { type: 'string', enum: katalog.map((k) => k.id) }, gewicht: { type: 'integer' } },
                    required: ['id', 'gewicht'],
                  },
                } } : {}),
              },
              required: ['qualityScore', 'niveau', 'titel', 'zusammenfassung', 'zuordnungen', 'tags', 'neueTagVorschlaege', ...(katalog.length ? ['kriterien'] : [])],
            },
          },
        },
      }),
    })
    if (res.status === 402) guthaben.leer = true // Guthaben aufgebraucht: Crawler bricht den ganzen Lauf ab
    if (!res.ok) throw new HttpFehler(res.status, `OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = (await res.json()) as {
      choices: { message: { content: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } }
    }
    const u = data.usage
    aiVerbrauch.aufrufe++
    aiVerbrauch.input += u?.prompt_tokens ?? 0
    aiVerbrauch.gecacht += u?.prompt_tokens_details?.cached_tokens ?? 0
    aiVerbrauch.output += u?.completion_tokens ?? 0
    aiVerbrauch.kostenUsd += u?.cost ?? 0
    const inhalt = data.choices?.[0]?.message?.content
    if (!inhalt) throw new HttpFehler(502, 'leere Antwort vom Anbieter') // → Retry, landet meist bei einem anderen Anbieter
    const k = JSON.parse(inhalt) as Klassifikation
    // Kriterien säubern: nur Katalog-ids, Gewicht 1–3, jede id höchstens einmal
    const erlaubt = new Set(katalog.map((x) => x.id))
    const einmalig = new Map<string, number>()
    for (const t of k.kriterien ?? []) {
      if (erlaubt.has(t.id)) einmalig.set(t.id, Math.min(3, Math.max(1, Math.round(t.gewicht))))
    }
    k.kriterien = [...einmalig].map(([id, gewicht]) => ({ id, gewicht }))
    return k
  }))
}

// Leeres OpenRouter-Guthaben (HTTP 402) — Crawler prüft das und hört auf, statt weiterzulaufen
// und dabei nur Fehler zu produzieren (Hub-Seiten würden gelöscht, ohne dass Dateien nachkommen)
export const guthaben = { leer: false }

// Verbrauch über den ganzen Lauf — der Crawler loggt ihn am Ende
export const aiVerbrauch = { aufrufe: 0, input: 0, gecacht: 0, output: 0, kostenUsd: 0 }
export const verbrauchText = () =>
  `AI: ${aiVerbrauch.aufrufe} Aufrufe, ${aiVerbrauch.input} Input-Tokens (davon ${aiVerbrauch.gecacht} aus Cache), ${aiVerbrauch.output} Output-Tokens, ${aiVerbrauch.kostenUsd.toFixed(2)} USD`

// Globale Obergrenze gleichzeitiger AI-Aufrufe (Rate-Limits beim Anbieter), unabhängig davon,
// wie viele Quellen parallel laufen
const AI_PARALLEL = Number(process.env.AI_PARALLEL) || 12
let aktiv = 0
const warteschlange: (() => void)[] = []
async function mitSlot<T>(f: () => Promise<T>): Promise<T> {
  if (aktiv >= AI_PARALLEL) await new Promise<void>((r) => warteschlange.push(r))
  aktiv++
  try { return await f() } finally { aktiv--; warteschlange.shift()?.() }
}

class HttpFehler extends Error { constructor(public status: number, msg: string) { super(msg) } }

// 429/5xx und Netzfehler: bis zu 3 Wiederholungen mit wachsender Pause; 4xx sonst sofort durchreichen
async function mitRetry<T>(f: () => Promise<T>): Promise<T> {
  for (let versuch = 0; ; versuch++) {
    try { return await f() } catch (e) {
      const status = e instanceof HttpFehler ? e.status : 0
      if (versuch >= 3 || (status && status !== 429 && status < 500)) throw e
      await new Promise((r) => setTimeout(r, 2000 * 2 ** versuch))
    }
  }
}

// Ohne OPENROUTER_API_KEY: simple Keyword-Heuristik, damit die Pipeline offline durchläuft.
function mockKlassifikation(text: string, optionen: ZuordnungsOption[], tagNamen: string[]): Klassifikation {
  const lower = text.toLowerCase()
  const wörter = (s: string) => s.toLowerCase().split(/\W+/).filter((w) => w.length > 4)
  const treffer = (o: ZuordnungsOption) => wörter(o.label).filter((w) => lower.includes(w)).length
  const zuordnungen = optionen
    .filter((o) => o.code.startsWith('K'))
    .map((o) => ({ code: o.code, n: treffer(o) }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((x) => x.code)
  const ersteZeile = text.split('\n').find((z) => z.trim().length > 3)?.trim() ?? 'Ohne Titel'
  return {
    qualityScore: text.length < 300 ? 15 : 60,
    niveau: 50,
    titel: ersteZeile.replace(/^#+\s*/, '').slice(0, 80),
    zusammenfassung: `[Mock ohne OPENROUTER_API_KEY] ${text.replace(/\s+/g, ' ').slice(0, 200)}…`,
    zuordnungen,
    tags: tagNamen.filter((t) => lower.includes(t.toLowerCase())).slice(0, 3),
    neueTagVorschlaege: [],
    kriterien: [],
  }
}
