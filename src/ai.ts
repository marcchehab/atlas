import { GoogleGenAI, Type } from '@google/genai'

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

export async function klassifiziere(
  text: string,
  optionen: ZuordnungsOption[],
  tagNamen: string[]
): Promise<Klassifikation> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return mockKlassifikation(text, optionen, tagNamen)

  const ai = new GoogleGenAI({ apiKey })
  const prompt = `Du klassifizierst Unterrichtsmaterial für Schweizer Gymnasien nach dem Rahmenlehrplan 2024.

Lehrplan-Raster (T… = ganzes Teilgebiet, K… = einzelne Kompetenz):
${optionen.map((o) => `${o.code}: ${o.label}`).join('\n')}

Erlaubte Tags: ${tagNamen.join(', ')}

Aufgaben:
1. qualityScore 0–100: Taugt das als Unterrichtsmaterial fürs Gymnasium? (<20 = Spam/untauglich; Latte tief ansetzen, im Zweifel aufnehmen)
2. titel: prägnanter Titel des Materials
3. zusammenfassung: 2–3 Sätze auf Deutsch
4. zuordnungen: abgedeckte Kompetenzen (K…); nur wenn ein Material ein Teilgebiet breit abdeckt, stattdessen dessen T…-Code. Leer, wenn nichts passt.
5. tags: passende Tags aus der erlaubten Liste
6. neueTagVorschlaege: max. 2 neue Tags, falls wichtige Aspekte fehlen (sonst leer)

Material:
${text.slice(0, 30000)}`

  const res = await ai.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          qualityScore: { type: Type.INTEGER },
          titel: { type: Type.STRING },
          zusammenfassung: { type: Type.STRING },
          zuordnungen: { type: Type.ARRAY, items: { type: Type.STRING, enum: optionen.map((o) => o.code) } },
          tags: { type: Type.ARRAY, items: { type: Type.STRING, enum: tagNamen } },
          neueTagVorschlaege: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['qualityScore', 'titel', 'zusammenfassung', 'zuordnungen', 'tags', 'neueTagVorschlaege'],
      },
    },
  })
  return JSON.parse(res.text ?? '{}') as Klassifikation
}

// Ohne GEMINI_API_KEY: simple Keyword-Heuristik, damit die Pipeline offline durchläuft.
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
    zusammenfassung: `[Mock ohne GEMINI_API_KEY] ${text.replace(/\s+/g, ' ').slice(0, 200)}…`,
    zuordnungen,
    tags: tagNamen.filter((t) => lower.includes(t.toLowerCase())).slice(0, 3),
    neueTagVorschlaege: [],
  }
}
