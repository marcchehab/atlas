export interface Klassifikation {
  qualityScore: number // 0–100; <20 = nicht aufgenommen
  titel: string
  zusammenfassung: string
  zuordnungen: string[] // Codes: "T1.2" (ganzes Teilgebiet) oder "K1.2.1" (einzelne Kompetenz)
  tags: string[]
  neueTagVorschlaege: string[]
}

// Auswahlliste fürs erzwungene Enum: Teilgebiete und Kompetenzen des Lehrplans.
export interface ZuordnungsOption {
  code: string // "T1.2" | "K1.2.1"
  label: string
}

const MODEL = process.env.AI_MODEL ?? 'google/gemini-3.5-flash-lite'

export async function klassifiziere(
  text: string,
  optionen: ZuordnungsOption[],
  tagNamen: string[]
): Promise<Klassifikation> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return mockKlassifikation(text, optionen, tagNamen)

  const prompt = `Du klassifizierst Unterrichtsmaterial für Schweizer Gymnasien nach dem Rahmenlehrplan 2024.

Lehrplan-Raster (T… = ganzes Teilgebiet, K… = einzelne Kompetenz):
${optionen.map((o) => `${o.code}: ${o.label}`).join('\n')}

Erlaubte Tags: ${tagNamen.join(', ')}

Aufgaben:
1. qualityScore 0–100: Taugt das als konkretes Unterrichtsmaterial fürs Gymnasium? (<20 = untauglich; Latte tief ansetzen, im Zweifel aufnehmen. Untauglich sind aber immer: Navigations-, Index- und Impressumsseiten sowie Start-/Portal-/Übersichtsseiten, die ein Angebot nur beschreiben oder verlinken statt selbst Unterrichtsinhalt zu sein.)
2. titel: prägnanter Titel des Materials
3. zusammenfassung: 2–3 Sätze auf Deutsch
4. zuordnungen: abgedeckte Kompetenzen (K…); nur wenn ein Material ein Teilgebiet breit abdeckt, stattdessen dessen T…-Code. Leer, wenn nichts passt. Nur zuordnen, was der Text selbst unterrichtet — nicht, was er bloß erwähnt oder verlinkt.
5. tags: passende Tags aus der erlaubten Liste
6. neueTagVorschlaege: meist leer — nur ausnahmsweise max. 2 neue Tags (kleingeschrieben, generisch wiederverwendbar wie die erlaubten Tags), wenn ein zentraler Aspekt durch kein erlaubtes Tag abbildbar ist. Keine Themen-Tags (dafür sind die Lernziele da), keine Synonyme.

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
