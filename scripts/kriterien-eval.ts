// Machbarkeitstest Kriterienkatalog (statt direkter Niveau-Zahl):
// Die KI erfasst pro Material nur, welche Taetigkeiten aus einem geschlossenen Katalog vorkommen
// und wie zentral (Gewicht 1-3). Das Niveau jedes Kriteriums ist Voting-Sache; der Gesamtscore
// wird daraus gerechnet. Gemessen wird deshalb zweierlei:
//   1. Extraktion: Trifft ein billiges Modell dieselben Kriterien zweimal? (Jaccard, Gewichts-Abstand)
//   2. Aggregation: Reproduziert der gerechnete Score die bekannten Baender der Anker-Belege?
// Vergleichsmassstab ist derselbe Beleg-Satz, auf dem model-eval.ts die direkte Zahl gemessen hat.
//
//   AI_MODEL=z-ai/glm-5.3-flash npx tsx scripts/kriterien-eval.ts lauf [laeufe]
//   npx tsx scripts/kriterien-eval.ts bericht
import fs from 'node:fs/promises'
import path from 'node:path'

const DIR = path.join(process.cwd(), 'data', 'eval')
const TEXTE = path.join(DIR, 'texte.json')
const KATALOG_MD = path.join(process.cwd(), 'scripts', 'kriterien-informatik.md')
const DISZIPLIN = 'informatik'
const MODELL = process.env.AI_MODEL ?? 'z-ai/glm-5.3-flash'
const PARALLEL = Number(process.env.AI_PARALLEL) || 12

interface Beleg { url: string; disziplin: string; von: number; bis: number; text?: string }
interface Kriterium { id: string; niveau: number; text: string; gruppe: string }
interface Treffer { id: string; gewicht: number }

async function katalog(): Promise<Kriterium[]> {
  const md = await fs.readFile(KATALOG_MD, 'utf8')
  const ks: Kriterium[] = []
  let gruppe = ''
  for (const z of md.split('\n')) {
    if (z.startsWith('## ')) gruppe = z.slice(3).trim()
    const m = z.match(/^- `([a-z0-9-]+)` \| (\d+) \| (.+)$/)
    if (m) ks.push({ id: m[1], niveau: +m[2], text: m[3].trim(), gruppe })
  }
  return ks
}

// ---- Aggregation: aus (Gewicht der KI, Niveau des Kriteriums) ein Material-Niveau ------------
// Alle Varianten rechnen auf denselben gespeicherten Kriterien — sie sind nachtraeglich
// austauschbar, ohne neu zu crawlen. Genau das ist der Punkt des Katalog-Ansatzes.
type Aggregat = (t: { niveau: number; gewicht: number }[]) => number | null

function quantil(p: number): Aggregat {
  return (t) => {
    if (!t.length) return null
    const s = [...t].sort((a, b) => a.niveau - b.niveau)
    const gesamt = s.reduce((x, k) => x + k.gewicht, 0)
    let kum = 0
    for (const k of s) { kum += k.gewicht; if (kum >= p * gesamt) return k.niveau }
    return s[s.length - 1].niveau
  }
}
const AGGREGATE: Record<string, Aggregat> = {
  'Summe (roh)': (t) => (t.length ? t.reduce((s, k) => s + k.gewicht * k.niveau, 0) : null),
  'gew. Mittel': (t) => (t.length ? t.reduce((s, k) => s + k.gewicht * k.niveau, 0) / t.reduce((s, k) => s + k.gewicht, 0) : null),
  'gew. Median': quantil(0.5),
  'gew. p70': quantil(0.7),
  'gew. p80': quantil(0.8),
  'Max ab Gewicht 2': (t) => { const r = t.filter((k) => k.gewicht >= 2); return r.length ? Math.max(...r.map((k) => k.niveau)) : (t.length ? Math.max(...t.map((k) => k.niveau)) : null) },
  'Max': (t) => (t.length ? Math.max(...t.map((k) => k.niveau)) : null),
}

// ---- KI-Aufruf: nur Kriterien erfassen, keine Zahl schaetzen ---------------------------------
async function erfasse(text: string, ks: Kriterium[], verbrauch: typeof VERBRAUCH): Promise<Treffer[]> {
  const apiKey = process.env.OPENROUTER_API_KEY
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
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model: MODELL,
      max_tokens: Number(process.env.AI_MAX_TOKENS) || 8000,
      ...(process.env.AI_OHNE_REASONING ? { reasoning: { enabled: false } } : { reasoning: { effort: process.env.AI_REASONING_EFFORT ?? 'low' } }),
      messages: [
        { role: 'system', content: [{ type: 'text', text: anweisung, cache_control: { type: 'ephemeral' } }] },
        { role: 'user', content: `Material:\n${text.slice(0, 30000)}` },
      ],
      usage: { include: true },
      provider: { require_parameters: true, ignore: (process.env.AI_ANBIETER_IGNORIEREN ?? 'OpenInference,Together').split(',').filter(Boolean) },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'kriterien', strict: true,
          schema: {
            type: 'object', additionalProperties: false,
            properties: {
              kriterien: {
                type: 'array',
                items: {
                  type: 'object', additionalProperties: false,
                  properties: { id: { type: 'string', enum: ks.map((k) => k.id) }, gewicht: { type: 'integer' } },
                  required: ['id', 'gewicht'],
                },
              },
            },
            required: ['kriterien'],
          },
        },
      },
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const data = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: Record<string, number | Record<string, number>> }
  const u = data.usage as { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } } | undefined
  verbrauch.aufrufe++
  verbrauch.input += u?.prompt_tokens ?? 0
  verbrauch.gecacht += u?.prompt_tokens_details?.cached_tokens ?? 0
  verbrauch.output += u?.completion_tokens ?? 0
  verbrauch.kostenUsd += u?.cost ?? 0
  const inhalt = data.choices?.[0]?.message?.content
  if (!inhalt) throw new Error('leere Antwort vom Anbieter')
  const roh = (JSON.parse(inhalt) as { kriterien: Treffer[] }).kriterien ?? []
  const erlaubt = new Set(ks.map((k) => k.id))
  const einmalig = new Map<string, number>()
  for (const t of roh) if (erlaubt.has(t.id)) einmalig.set(t.id, Math.min(3, Math.max(1, Math.round(t.gewicht))))
  return [...einmalig].map(([id, gewicht]) => ({ id, gewicht }))
}

const VERBRAUCH = { aufrufe: 0, input: 0, gecacht: 0, output: 0, kostenUsd: 0 }

async function parallelMap<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (i < xs.length) { const j = i++; out[j] = await f(xs[j]) }
  }))
  return out
}

async function lauf() {
  const laeufe = Number(process.argv[3]) || 2
  const ks = await katalog()
  const alle: Beleg[] = JSON.parse(await fs.readFile(TEXTE, 'utf8'))
  const belege = alle.filter((b) => b.disziplin === DISZIPLIN).slice(0, Number(process.env.LIMIT) || Infinity)
  console.log(`${belege.length} Belege, ${ks.length} Kriterien, ${laeufe} Laeufe, Modell ${MODELL}`)
  const t0 = Date.now()
  const ergebnisse = await parallelMap(belege, PARALLEL, async (b) => {
    const durchgaenge: (Treffer[] | { fehler: string })[] = []
    for (let l = 0; l < laeufe; l++) {
      try { durchgaenge.push(await erfasse(b.text!, ks, VERBRAUCH)) }
      catch (e) { durchgaenge.push({ fehler: (e as Error).message.slice(0, 140) }) }
    }
    const ok = durchgaenge.filter((d): d is Treffer[] => Array.isArray(d))
    console.log(`${b.von}–${b.bis}  ${ok[0] ? ok[0].map((t) => `${t.id}:${t.gewicht}`).join(' ') : 'FEHLER'}  ${b.url.slice(0, 70)}`)
    return { url: b.url, von: b.von, bis: b.bis, laenge: b.text!.length, durchgaenge }
  })
  await fs.writeFile(path.join(DIR, `kriterien_${MODELL.replace(/\//g, '_')}.json`),
    JSON.stringify({ modell: MODELL, laeufe, katalog: ks, verbrauch: VERBRAUCH, sekunden: (Date.now() - t0) / 1000, ergebnisse }, null, 1))
  console.log(`fertig: ${VERBRAUCH.aufrufe} Aufrufe, ${VERBRAUCH.kostenUsd.toFixed(3)} USD, ${Math.round((Date.now() - t0) / 1000)} s`)
}

// ---- Kennzahlen -------------------------------------------------------------------------------
function spearman(a: number[], b: number[]): number {
  const rang = (x: number[]) => {
    const idx = x.map((v, i) => [v, i] as [number, number]).sort((p, q) => p[0] - q[0])
    const r = new Array(x.length)
    for (let i = 0; i < idx.length;) {
      let j = i
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2
      i = j + 1
    }
    return r as number[]
  }
  const ra = rang(a), rb = rang(b), n = a.length
  const m = (x: number[]) => x.reduce((s, v) => s + v, 0) / n
  const ma = m(ra), mb = m(rb)
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2 }
  return num / Math.sqrt(da * db)
}
// Belege, die kein Unterrichtsmaterial sind: Lehrplaene, Pruefungsvorgaben, Kurskataloge,
// Index- und Produktseiten. Ein Lehrplan listet anspruchsvolle Taetigkeiten auf, laesst sie aber
// niemanden ausfuehren — der Katalog-Ansatz misst dort zwangslaeufig etwas anderes als das Beleg-Band.
const META = [/lehrplan\.ch/, /phlu\.ch/, /aufgabensammlung/, /pruefungen\/index/, /gymlaufen\.ch/,
  /ag\.ch\/media/, /zh\.ch\/content/, /gymliestal\.ch/, /vvz\.ethz\.ch/, /produkte\/lehrmittel/]
const istMeta = (url: string) => META.some((r) => r.test(url))

const bandVon = (v: number) => Math.floor((Math.max(1, Math.min(100, v)) - 1) / 20)

async function bericht() {
  const f = (await fs.readdir(DIR)).find((x) => x.startsWith('kriterien_'))
  if (!f) { console.log('kein Lauf gefunden'); return }
  const { modell, laeufe, katalog: ks, verbrauch, sekunden, ergebnisse } =
    JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8')) as {
      modell: string; laeufe: number; katalog: Kriterium[]; verbrauch: typeof VERBRAUCH; sekunden: number
      ergebnisse: { url: string; von: number; bis: number; laenge: number; durchgaenge: (Treffer[] | { fehler: string })[] }[]
    }
  const niveauVon = new Map(ks.map((k) => [k.id, k.niveau]))
  const ok = ergebnisse.map((e) => ({ ...e, ok: e.durchgaenge.filter((d): d is Treffer[] => Array.isArray(d)) })).filter((e) => e.ok.length)
  const ausfaelle = ergebnisse.length - ok.length

  console.log(`\n# Kriterien-Eval ${modell} — ${ergebnisse.length} Informatik-Belege, ${laeufe} Laeufe, ${ks.length} Kriterien`)
  console.log(`${verbrauch.aufrufe} Aufrufe, ${verbrauch.kostenUsd.toFixed(3)} USD (${(verbrauch.kostenUsd / verbrauch.aufrufe * 100).toFixed(2)} ¢/Material, hochgerechnet ${Math.round(verbrauch.kostenUsd / verbrauch.aufrufe * 17000)} USD fuer 17k), ${Math.round(sekunden)} s, ${ausfaelle} Ausfaelle`)
  console.log(`Cache: ${Math.round(verbrauch.gecacht / Math.max(1, verbrauch.input) * 100)} % der Input-Tokens`)

  // 1. Stabilitaet der Extraktion
  const jac: number[] = [], gAbw: number[] = []
  for (const e of ok) {
    if (e.ok.length < 2) continue
    const [a, b] = e.ok
    const sa = new Set(a.map((t) => t.id)), sb = new Set(b.map((t) => t.id))
    const schnitt = [...sa].filter((x) => sb.has(x))
    const union = new Set([...sa, ...sb]).size
    if (union) jac.push(schnitt.length / union)
    const ga = new Map(a.map((t) => [t.id, t.gewicht])), gb = new Map(b.map((t) => [t.id, t.gewicht]))
    for (const id of schnitt) gAbw.push(Math.abs(ga.get(id)! - gb.get(id)!))
  }
  const mit = (x: number[]) => x.reduce((s, v) => s + v, 0) / Math.max(1, x.length)
  console.log(`\n## Stabilitaet der Extraktion (Lauf 1 vs. 2)`)
  console.log(`Jaccard der erkannten ids: ${mit(jac).toFixed(2)} (1.00 = identisch), Median ${[...jac].sort((a, b) => a - b)[Math.floor(jac.length / 2)]?.toFixed(2)}`)
  console.log(`gleiche id, gleiches Gewicht: ${Math.round(gAbw.filter((d) => d === 0).length / Math.max(1, gAbw.length) * 100)} %, Ø Gewichts-Abstand ${mit(gAbw).toFixed(2)}`)
  console.log(`Ø erkannte Kriterien pro Material: ${mit(ok.map((e) => e.ok[0].length)).toFixed(1)}, ohne Treffer: ${ok.filter((e) => !e.ok[0].length).length}`)

  // 2. Aggregation gegen die bekannten Baender
  console.log(`\n## Aggregation gegen die Beleg-Baender (35 Belege)`)
  console.log('| Aggregat | Band exakt | ±1 Band | Ø Abstand | Tendenz | Spearman | Streuung L1/L2 |')
  console.log('|---|---|---|---|---|---|---|')
  const skaliert = (name: string, werte: number[]) => {
    // «Summe (roh)» ist unbeschraenkt — fuer Band-Treffer auf 1..100 normiert (Rangkorrelation bleibt gleich)
    if (name !== 'Summe (roh)') return werte
    const max = Math.max(...werte)
    return werte.map((v) => Math.max(1, Math.round(v / max * 100)))
  }
  const tabelle = (menge: typeof ok) => {
  for (const [name, agg] of Object.entries(AGGREGATE)) {
    const roh = menge.map((e) => ({ e, v: agg(e.ok[0].map((t) => ({ niveau: niveauVon.get(t.id)!, gewicht: t.gewicht }))) })).filter((x) => x.v != null)
    const werte = skaliert(name, roh.map((x) => x.v!))
    const mitte = roh.map((x) => (x.e.von + x.e.bis) / 2)
    const treffer = roh.filter((x, i) => werte[i] >= x.e.von && werte[i] <= x.e.bis).length
    const nah = roh.filter((x, i) => Math.abs(bandVon(werte[i]) - bandVon(mitte[i])) <= 1).length
    const abst = mit(roh.map((x, i) => Math.abs(werte[i] - mitte[i])))
    const bias = mit(roh.map((x, i) => werte[i] - mitte[i]))
    // Streuung zwischen den beiden Laeufen
    const paare = menge.filter((e) => e.ok.length >= 2)
    const diff = paare.map((e) => {
      const v = e.ok.slice(0, 2).map((d) => agg(d.map((t) => ({ niveau: niveauVon.get(t.id)!, gewicht: t.gewicht }))))
      return v[0] != null && v[1] != null ? Math.abs(v[0] - v[1]) : null
    }).filter((d): d is number => d != null)
    console.log(`| ${name} | ${Math.round(treffer / roh.length * 100)} % | ${Math.round(nah / roh.length * 100)} % | ${abst.toFixed(0)} | ${bias > 0 ? '+' : ''}${bias.toFixed(0)} | ${spearman(mitte, werte).toFixed(2)} | ${mit(diff).toFixed(1)} |`)
  }
  }
  tabelle(ok)
  const echt = ok.filter((e) => !istMeta(e.url))
  console.log(`\n## Dasselbe nur fuer echtes Unterrichtsmaterial (${echt.length} von ${ok.length}; Lehrplaene, Pruefungsvorgaben, Kurskataloge und Index-Seiten weggelassen)`)
  console.log('| Aggregat | Band exakt | ±1 Band | Ø Abstand | Tendenz | Spearman | Streuung L1/L2 |')
  console.log('|---|---|---|---|---|---|---|')
  tabelle(echt)

  // 3. Vergleich: direkte Zahl desselben Modells auf denselben 35 Belegen
  try {
    const direkt = JSON.parse(await fs.readFile(path.join(DIR, `${modell.replace(/\//g, '_')}.json`), 'utf8')) as { ergebnisse: { url: string; von: number; bis: number; niveau?: number }[] }
    const urls = new Set(ergebnisse.map((e) => e.url))
    const d = direkt.ergebnisse.filter((x) => urls.has(x.url) && x.niveau != null)
    const zeige = (d: typeof direkt.ergebnisse, titel: string) => {
      if (!d.length) return
      const mitte = d.map((x) => (x.von + x.bis) / 2), werte = d.map((x) => x.niveau!)
      const treffer = d.filter((x) => x.niveau! >= x.von && x.niveau! <= x.bis).length
      const nah = d.filter((x) => Math.abs(bandVon(x.niveau!) - bandVon((x.von + x.bis) / 2)) <= 1).length
      console.log(`${titel.padEnd(14)} n=${String(d.length).padStart(2)}  Band exakt ${Math.round(treffer / d.length * 100)} %, ±1 Band ${Math.round(nah / d.length * 100)} %, Ø Abstand ${mit(d.map((x) => Math.abs(x.niveau! - (x.von + x.bis) / 2))).toFixed(0)}, Spearman ${spearman(mitte, werte).toFixed(2)}`)
    }
    console.log(`\n## Vergleich: direkte Niveau-Zahl, gleiches Modell, gleiche Belege`)
    zeige(d, 'alle')
    zeige(d.filter((x) => !istMeta(x.url)), 'nur Material')
  } catch { /* kein direkter Lauf da */ }

  // 4. Katalog-Hygiene
  const zaehler = new Map<string, number>()
  for (const e of ok) for (const t of e.ok[0]) zaehler.set(t.id, (zaehler.get(t.id) ?? 0) + 1)
  const nie = ks.filter((k) => !zaehler.has(k.id))
  console.log(`\n## Katalog: ${zaehler.size}/${ks.length} Kriterien haben gefeuert`)
  console.log('haeufigste: ' + [...zaehler].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => `${id} ${n}`).join(', '))
  if (nie.length) console.log('nie gefeuert: ' + nie.map((k) => k.id).join(', '))

  // 5. Einzelfaelle
  console.log(`\n## Belege einzeln (Lauf 1)`)
  for (const e of ok) {
    const t = e.ok[0].map((x) => ({ niveau: niveauVon.get(x.id)!, gewicht: x.gewicht }))
    const p80 = AGGREGATE['gew. p80'](t), mittel = AGGREGATE['gew. Mittel'](t)
    const soll = `${e.von}–${e.bis}`.padEnd(7)
    console.log(`${soll} p80 ${String(p80 ?? '-').padStart(3)}  Mittel ${mittel != null ? mittel.toFixed(0).padStart(3) : '  -'}  ${e.ok[0].map((x) => `${x.id}:${x.gewicht}`).join(' ')}  ${e.url.slice(0, 60)}`)
  }
}

await (process.argv[2] === 'lauf' ? lauf() : bericht())
