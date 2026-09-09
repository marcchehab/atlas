export interface Klassifikation {
  qualityScore: number // 0–100; <20 = nicht aufgenommen
  titel: string
  zusammenfassung: string
  zuordnungen: string[] // Codes: "T:<lehrplan>:1.2" (ganzes Teilgebiet) oder "K:<lehrplan>:1.2.1" (einzelne Kompetenz)
  tags: string[]
  neueTagVorschlaege: string[]
}

// Auswahlliste fürs erzwungene Enum: Teilgebiete und Kompetenzen des Lehrplans.
export interface ZuordnungsOption {
  code: string // "T:<lehrplan>:1.2" | "K:<lehrplan>:1.2.1"
  label: string
}

const MODEL = process.env.AI_MODEL ?? 'google/gemini-3.5-flash-lite'

// Bewertungskriterien fürs AI-Band — Teil des Prompts und wörtlich auf /sortierung veröffentlicht
export const SCORE_PROMPT = `1. qualityScore 0–100: Taugt das als Unterrichtsmaterial fürs Gymnasium, und wie gut?
   Gutes Material erklärt zuerst anschaulich und intuitiv, dann erst formal, zeigt gute Beispiele und lässt die Schüler:innen mit Aufgaben und Lösungen selbst arbeiten. Und es begeistert: spielerisch, überraschend, lustig, mit echtem Bezug zur Welt der Schüler:innen. Gute Übungen sind wertvoll, werte Übungsblätter nicht ab. Entscheidend ist, ob die Aufgaben interessant und spannend sind oder Routine.
   Auch ein gutes Werkzeug kann sehr gut bewertet werden: interaktive Simulatoren, Rechner, Editoren oder Spiele, mit denen Schüler:innen etwas ausprobieren und verstehen (z.B. ein Little-Man-Computer-Simulator), gehören in die oberen Bänder, auch wenn sie wenig erklärenden Text enthalten. Erkenne Werkzeuge auch an Bedienelementen und Beschreibungen, nicht nur an Erklärtext.
   Bewerte nur, was im Text selbst steht, nicht was verlinkt oder angekündigt wird.
   Bänder (innerhalb eines Bands graduell abstufen):
   0–20 untauglich: kein Unterrichtsinhalt — Navigation, Portal, Index, Impressum, Linkliste, Fragment, falsches Niveau.
   21–40 Rohmaterial: Inhalt vorhanden, aber ohne Einstieg, ohne Beispiele oder ohne Lösungen — Folien, Notizen, nackte Theorie, Aufgaben ohne Lösungen. Nur mit Lehrperson nutzbar.
   41–60 solide: verständlich aufgebaut — Erklärung mit Beispielen oder Übungen mit Lösungen, Begriffe sauber. Funktioniert im Unterricht, ist aber Routine.
   61–80 lebendig: solide, und dazu etwas, das Schülerinnen und Schüler packt — spielerischer Zugang, überraschendes Beispiel, Rätsel, Projekt, Wettbewerb, Humor, interaktives Werkzeug, echter Bezug zu ihrer Welt. Auch ein Übungsblatt, wenn die Aufgaben interessant und spannend sind.
   81–100 begeisternd: didaktisch vollständig — Intuition vor Formalismus, gute Beispiele, gute Aufgaben mit Lösungen, Zusammenfassung oder Selbstcheck — und die Klasse will das machen. Oder ein Werkzeug, mit dem man das Thema selbst erkunden kann. Material, das man Kolleg:innen sofort weiterschickt.`

export const SCORE_BAENDER: [number, string, string][] = [
  [0, 'untauglich', 'kein Unterrichtsinhalt: Navigation, Portal, Linkliste'],
  [21, 'Rohmaterial', 'Inhalt ohne Einstieg, Beispiele oder Lösungen, braucht die Lehrperson dazu'],
  [41, 'solide', 'verständlich aufgebaut, mit Beispielen oder Übungen und Lösungen'],
  [61, 'lebendig', 'packt die Schüler: spielerisch, überraschend, mit Bezug zu ihrer Welt'],
  [81, 'begeisternd', 'didaktisch vollständig und mitreissend, das schickt man Kollegen weiter'],
]
export const bandName = (score: number) => [...SCORE_BAENDER].reverse().find(([von]) => score >= von)![1]

export async function klassifiziere(
  text: string,
  optionen: ZuordnungsOption[],
  tagNamen: string[]
): Promise<Klassifikation> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return mockKlassifikation(text, optionen, tagNamen)

  const prompt = `Du klassifizierst Unterrichtsmaterial für Schweizer Gymnasien nach Lehrplänen (Rahmenlehrplan 2024 sowie kantonale Fachlehrpläne, z.B. Schwerpunktfächer).

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

Material:
${text.slice(0, 30000)}`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
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
              titel: { type: 'string' },
              zusammenfassung: { type: 'string' },
              zuordnungen: { type: 'array', items: { type: 'string', enum: optionen.map((o) => o.code) } },
              tags: { type: 'array', items: { type: 'string', enum: tagNamen } },
              neueTagVorschlaege: { type: 'array', items: { type: 'string' } },
            },
            required: ['qualityScore', 'titel', 'zusammenfassung', 'zuordnungen', 'tags', 'neueTagVorschlaege'],
          },
        },
      },
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  return JSON.parse(data.choices[0].message.content) as Klassifikation
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
    titel: ersteZeile.replace(/^#+\s*/, '').slice(0, 80),
    zusammenfassung: `[Mock ohne OPENROUTER_API_KEY] ${text.replace(/\s+/g, ' ').slice(0, 200)}…`,
    zuordnungen,
    tags: tagNamen.filter((t) => lower.includes(t.toLowerCase())).slice(0, 3),
    neueTagVorschlaege: [],
  }
}
