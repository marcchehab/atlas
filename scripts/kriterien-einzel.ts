// Einzelne URLs durch die Kriterien-Extraktion, mehrere Laeufe — fuer Stichproben wie Turtle Invaders.
//   npx tsx scripts/kriterien-einzel.ts <laeufe> <url> [url ...]
import fs from 'node:fs/promises'
import path from 'node:path'
import { extract, stripTags } from '../src/extract.js'

const MODELL = process.env.AI_MODEL ?? 'z-ai/glm-5.3-flash'
interface Kriterium { id: string; niveau: number; text: string }

async function katalog(): Promise<Kriterium[]> {
  const md = await fs.readFile(path.join(process.cwd(), 'scripts', 'kriterien-informatik.md'), 'utf8')
  return md.split('\n').flatMap((z) => {
    const m = z.match(/^- `([a-z0-9-]+)` \| (\d+) \| (.+)$/)
    return m ? [{ id: m[1], niveau: +m[2], text: m[3].trim() }] : []
  })
}

async function erfasse(text: string, ks: Kriterium[]) {
  const anweisung = `Du erfasst, welche Taetigkeiten in einem Unterrichtsmaterial fuer Schweizer Gymnasien (Informatik) tatsaechlich vorkommen.

Katalog (id: Taetigkeit):
${ks.map((k) => `${k.id}: ${k.text}`).join('\n')}

Aufgabe: Gib alle ids zurueck, deren Taetigkeit im Material vorkommt, je mit einem Gewicht:
3 = zentral, das Material dreht sich darum
2 = deutlich vorhanden, ein eigener Abschnitt oder mehrere Aufgaben
1 = am Rande erwaehnt oder nur ein kurzer Nebenaspekt

Regeln:
- Massgebend ist, was das Material die Lernenden tun laesst oder vormacht, nicht welches Thema es nennt. Ein Text ueber Sortierverfahren ohne jede Analyse erfuellt alg-vergleichen nicht.
- Nur bewerten, was im Text selbst steht, nicht was verlinkt oder angekuendigt wird.
- Unterscheide die Anforderung: Code nur nachvollziehen (prog-lesen) ist etwas anderes als Code selbst entwerfen (prog-entwerfen).
- Lieber wenige treffende ids als viele vage. Typisch sind 2-6 ids.
- Passt nichts, gib eine leere Liste zurueck.`
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model: MODELL, max_tokens: 8000, reasoning: { effort: 'low' },
      messages: [
        { role: 'system', content: [{ type: 'text', text: anweisung, cache_control: { type: 'ephemeral' } }] },
        { role: 'user', content: `Material:\n${text.slice(0, 30000)}` },
      ],
      usage: { include: true },
      provider: { require_parameters: true, ignore: ['OpenInference', 'Together'] },
      response_format: { type: 'json_schema', json_schema: { name: 'kriterien', strict: true, schema: {
        type: 'object', additionalProperties: false,
        properties: { kriterien: { type: 'array', items: { type: 'object', additionalProperties: false,
          properties: { id: { type: 'string', enum: ks.map((k) => k.id) }, gewicht: { type: 'integer' } },
          required: ['id', 'gewicht'] } } },
        required: ['kriterien'] } } },
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = await res.json() as { choices?: { message?: { content?: string } }[] }
  const c = d.choices?.[0]?.message?.content
  if (!c) throw new Error('leere Antwort')
  return (JSON.parse(c) as { kriterien: { id: string; gewicht: number }[] }).kriterien
}

const ks = await katalog()
const niveauVon = new Map(ks.map((k) => [k.id, k.niveau]))
const laeufe = Number(process.argv[2]) || 3
for (const url of process.argv.slice(3)) {
  const html = await (await fetch(url, { headers: { 'User-Agent': 'AtlasBot/0.1 (+https://atlas.eduskript.org)' } })).text()
  const text = await extract(html).catch(() => stripTags(html))
  console.log(`\n${url}  (${text.length} Zeichen)`)
  for (let i = 0; i < laeufe; i++) {
    try {
      const t = await erfasse(text, ks)
      const g = t.map((x) => ({ n: niveauVon.get(x.id)!, g: x.gewicht })).filter((x) => x.n != null)
      const mittel = g.length ? g.reduce((s, x) => s + x.g * x.n, 0) / g.reduce((s, x) => s + x.g, 0) : NaN
      const s = [...g].sort((a, b) => a.n - b.n); const ges = s.reduce((x, k) => x + k.g, 0)
      let kum = 0, med = NaN
      for (const k of s) { kum += k.g; if (kum >= 0.5 * ges) { med = k.n; break } }
      console.log(`  Lauf ${i + 1}: Mittel ${mittel.toFixed(0)}  Median ${med}  ${t.map((x) => `${x.id}:${x.gewicht}`).join(' ')}`)
    } catch (e) { console.log(`  Lauf ${i + 1}: FEHLER ${(e as Error).message}`) }
  }
}
