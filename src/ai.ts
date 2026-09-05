import { GoogleGenAI, Type } from '@google/genai'

export interface Klassifikation {
  qualityScore: number // 0–100; <20 = nicht aufgenommen
  titel: string
  zusammenfassung: string
  lernzielCodes: string[]
  tags: string[]
  neueTagVorschlaege: string[]
}

export interface LernzielInfo {
  code: string
  text: string
}

export async function klassifiziere(
  text: string,
  lernziele: LernzielInfo[],
  tagNamen: string[]
): Promise<Klassifikation> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return mockKlassifikation(text, lernziele, tagNamen)

  const ai = new GoogleGenAI({ apiKey })
  const prompt = `Du klassifizierst Unterrichtsmaterial für Schweizer Gymnasien (Fach Informatik).

Lernziele (Code: Beschreibung):
${lernziele.map((l) => `${l.code}: ${l.text}`).join('\n')}

Erlaubte Tags: ${tagNamen.join(', ')}

Aufgaben:
1. qualityScore 0–100: Taugt das als Unterrichtsmaterial fürs Gymnasium? (<20 = Spam/untauglich; Latte tief ansetzen, im Zweifel aufnehmen)
2. titel: prägnanter Titel des Materials
3. zusammenfassung: 2–3 Sätze auf Deutsch
4. lernzielCodes: alle abgedeckten Lernziele (leer, wenn keines passt)
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
          lernzielCodes: { type: Type.ARRAY, items: { type: Type.STRING, enum: lernziele.map((l) => l.code) } },
          tags: { type: Type.ARRAY, items: { type: Type.STRING, enum: tagNamen } },
          neueTagVorschlaege: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['qualityScore', 'titel', 'zusammenfassung', 'lernzielCodes', 'tags', 'neueTagVorschlaege'],
      },
    },
  })
  return JSON.parse(res.text ?? '{}') as Klassifikation
}

// Ohne GEMINI_API_KEY: simple Keyword-Heuristik, damit die Pipeline offline durchläuft.
function mockKlassifikation(text: string, lernziele: LernzielInfo[], tagNamen: string[]): Klassifikation {
  const lower = text.toLowerCase()
  const wörter = (s: string) => s.toLowerCase().split(/\W+/).filter((w) => w.length > 4)
  const treffer = (l: LernzielInfo) => wörter(l.text).filter((w) => lower.includes(w)).length
  const lernzielCodes = lernziele
    .map((l) => ({ code: l.code, n: treffer(l) }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((x) => x.code)
  const ersteZeile = text.split('\n').find((z) => z.trim().length > 3)?.trim() ?? 'Ohne Titel'
  return {
    qualityScore: text.length < 300 ? 15 : 60,
    titel: ersteZeile.replace(/^#+\s*/, '').slice(0, 80),
    zusammenfassung: `[Mock ohne GEMINI_API_KEY] ${text.replace(/\s+/g, ' ').slice(0, 200)}…`,
    lernzielCodes,
    tags: tagNamen.filter((t) => lower.includes(t.toLowerCase())).slice(0, 3),
    neueTagVorschlaege: [],
  }
}
