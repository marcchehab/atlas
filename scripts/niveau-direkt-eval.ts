// Direkte Niveau-Zahl mit den gekuerzten Ankern (27.9.) — dieselben 35 Informatik-Belege und
// dieselben Kennzahlen wie scripts/kriterien-eval.ts, damit beide Ansaetze vergleichbar sind.
// Nur die Niveau-Aufgabe, ohne Raster/Tags/Didaktik: misst den Niveau-Teil isoliert.
//   AI_MODEL=z-ai/glm-5.3-flash npx tsx scripts/niveau-direkt-eval.ts lauf [laeufe]
//   npx tsx scripts/niveau-direkt-eval.ts bericht
import fs from 'node:fs/promises'
import path from 'node:path'
import { NIVEAU_PROMPT } from '../src/niveau.js'

const DIR = path.join(process.cwd(), 'data', 'eval')
const MODELL = process.env.AI_MODEL ?? 'z-ai/glm-5.3-flash'
const PARALLEL = Number(process.env.AI_PARALLEL) || 10
interface Beleg { url: string; disziplin: string; von: number; bis: number; text?: string }
const VERBRAUCH = { aufrufe: 0, input: 0, gecacht: 0, output: 0, kostenUsd: 0 }

async function anker(): Promise<string> {
  const md = await fs.readFile(path.join(process.cwd(), 'niveau', 'informatik.md'), 'utf8')
  const t = md.split(/^## /m).find((x) => x.startsWith('Anker'))!
  return t.slice(t.indexOf('\n') + 1).trim().split('\n').map((z) => `   ${z}`).join('\n')
}

async function bewerte(text: string, ankerText: string): Promise<number> {
  const anweisung = `Du bewertest das fachliche Anspruchsniveau von Unterrichtsmaterial fuer Schweizer Gymnasien (Informatik).

${NIVEAU_PROMPT}
   Fach-Anker Informatik:
${ankerText}`
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model: MODELL, max_tokens: Number(process.env.AI_MAX_TOKENS) || 8000,
      reasoning: { effort: process.env.AI_REASONING_EFFORT ?? 'low' },
      messages: [
        { role: 'system', content: [{ type: 'text', text: anweisung, cache_control: { type: 'ephemeral' } }] },
        { role: 'user', content: `Material:\n${text.slice(0, 30000)}` },
      ],
      usage: { include: true },
      provider: { require_parameters: true, ignore: ['OpenInference', 'Together'] },
      response_format: { type: 'json_schema', json_schema: { name: 'niveau', strict: true, schema: {
        type: 'object', additionalProperties: false,
        properties: { niveau: { type: 'integer' } }, required: ['niveau'] } } },
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } } }
  const u = d.usage
  VERBRAUCH.aufrufe++; VERBRAUCH.input += u?.prompt_tokens ?? 0
  VERBRAUCH.gecacht += u?.prompt_tokens_details?.cached_tokens ?? 0
  VERBRAUCH.output += u?.completion_tokens ?? 0; VERBRAUCH.kostenUsd += u?.cost ?? 0
  const c = d.choices?.[0]?.message?.content
  if (!c) throw new Error('leere Antwort')
  return (JSON.parse(c) as { niveau: number }).niveau
}

async function parallelMap<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (i < xs.length) { const j = i++; out[j] = await f(xs[j]) }
  }))
  return out
}

async function lauf() {
  const laeufe = Number(process.argv[3]) || 2
  const a = await anker()
  const belege: Beleg[] = JSON.parse(await fs.readFile(path.join(DIR, 'texte.json'), 'utf8'))
    .filter((b: Beleg) => b.disziplin === 'informatik')
  console.log(`${belege.length} Belege, ${laeufe} Laeufe, ${MODELL}, gekuerzte Anker`)
  const t0 = Date.now()
  const ergebnisse = await parallelMap(belege, PARALLEL, async (b) => {
    const werte: (number | null)[] = []
    for (let l = 0; l < laeufe; l++) {
      try { werte.push(await bewerte(b.text!, a)) } catch { werte.push(null) }
    }
    console.log(`${b.von}–${b.bis}  ${werte.join(' / ')}  ${b.url.slice(0, 70)}`)
    return { url: b.url, von: b.von, bis: b.bis, werte }
  })
  await fs.writeFile(path.join(DIR, 'direkt_kurzanker.json'),
    JSON.stringify({ modell: MODELL, laeufe, verbrauch: VERBRAUCH, sekunden: (Date.now() - t0) / 1000, ergebnisse }, null, 1))
  console.log(`fertig: ${VERBRAUCH.aufrufe} Aufrufe, ${VERBRAUCH.kostenUsd.toFixed(3)} USD, ${Math.round((Date.now() - t0) / 1000)} s`)
}

await lauf()
