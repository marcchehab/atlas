// Modell-Vergleich für die Atlas-Klassifikation. Testset: die Belege der Fach-Anker
// (niveau/<disziplin>.md, «### <Band>»-Abschnitte) — Dokumente mit bekannter Stufe — plus der
// Serlo-Kalibrierfall. Gemessen pro Modell: Band-Treffer, ±1 Band, Abstand zur Bandmitte,
// Rangkorrelation, Streuung (verschiedene Werte, Anteil des häufigsten), Ausfälle, Kosten.
//
//   npx tsx scripts/model-eval.ts texte                  # Belege laden → data/eval/texte.json
//   AI_MODEL=<id> npx tsx scripts/model-eval.ts lauf     # ein Modell → data/eval/<id>.json
//   npx tsx scripts/model-eval.ts bericht                # Tabelle über alle Läufe
import fs from 'node:fs/promises'
import path from 'node:path'
import { extract, stripTags } from '../src/extract.js'
import { klassifiziere, aiVerbrauch } from '../src/ai.js'
import { fachAnker } from '../src/niveau.js'
import { prisma } from '../src/db.js'
import { spawn } from 'node:child_process'

const DIR = path.join(process.cwd(), 'data', 'eval')
const TEXTE = path.join(DIR, 'texte.json')
const DISZIPLINEN = ['informatik', 'mathematik', 'physik', 'chemie']
const UA = { 'User-Agent': 'AtlasBot/0.1 (+https://atlas.eduskript.org)' }

interface Beleg { url: string; disziplin: string; von: number; bis: number; text?: string }

function werkzeug(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('error', reject)
    p.on('close', (c) => (c === 0 ? resolve(out) : reject(new Error(`${cmd} ${c}`))))
  })
}

async function belegeAusAnkern(): Promise<Beleg[]> {
  const belege: Beleg[] = []
  for (const d of DISZIPLINEN) {
    const md = await fs.readFile(path.join(process.cwd(), 'niveau', `${d}.md`), 'utf8')
    let band: [number, number] | null = null
    let inBelegen = false
    for (const z of md.split('\n')) {
      if (z.startsWith('## ')) inBelegen = /Belege|Kalibrierfall/.test(z)
      const b = z.match(/^### (\d+)–(\d+)/)
      if (b) band = [+b[1], +b[2]]
      if (!inBelegen) continue
      const link = z.match(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/)
      if (!link) continue
      // Kalibrierfall: «→ **20–25**» als erwarteter Bereich
      const k = z.match(/→ \*\*(\d+)–(\d+)\*\*/)
      if (k) belege.push({ url: link[1], disziplin: d, von: +k[1], bis: +k[2] })
      else if (band) belege.push({ url: link[1], disziplin: d, von: band[0], bis: band[1] })
    }
  }
  return belege
}

async function texte() {
  const belege = await belegeAusAnkern()
  await fs.mkdir(DIR, { recursive: true })
  for (const b of belege) {
    try {
      const res = await fetch(b.url, { headers: UA, signal: AbortSignal.timeout(30000) })
      if (!res.ok) continue
      const ctype = res.headers.get('content-type') ?? ''
      if (/pdf/i.test(ctype) || /\.pdf(\?|$)/i.test(b.url)) {
        const tmp = path.join(DIR, 'tmp.pdf')
        await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()))
        b.text = await werkzeug('pdftotext', [tmp, '-']).catch(() => '')
        await fs.rm(tmp, { force: true })
      } else if (/html|xml/i.test(ctype)) {
        const html = await res.text()
        b.text = await extract(html).catch(() => stripTags(html))
      }
    } catch { /* nicht erreichbar */ }
    console.log(`${b.text && b.text.length > 200 ? 'ok ' : '-- '} ${b.von}–${b.bis} ${b.url.slice(0, 90)}`)
    await new Promise((r) => setTimeout(r, 300))
  }
  const brauchbar = belege.filter((b) => b.text && b.text.length > 200)
  await fs.writeFile(TEXTE, JSON.stringify(brauchbar))
  console.log(`${brauchbar.length}/${belege.length} Belege mit Text`)
}

async function kontext(disziplin: string) {
  const tgs = await prisma.teilgebiet.findMany({
    where: { lerngebiet: { fach: { disziplin: { code: disziplin } } } },
    include: { kompetenzen: true, lerngebiet: { include: { fach: true } } },
  })
  const optionen = tgs.flatMap((tg) => [
    { code: `T:${tg.lerngebiet.fach.code}:${tg.code}`, label: `${tg.lerngebiet.name} → ${tg.name} (gesamtes Teilgebiet)` },
    ...tg.kompetenzen.map((k) => ({ code: `K:${tg.lerngebiet.fach.code}:${k.code}`, label: k.text })),
  ])
  const a = fachAnker(disziplin)
  const name = disziplin[0].toUpperCase() + disziplin.slice(1)
  const anker = a ? `   ${name}:\n${a.anker.split('\n').map((z) => `   ${z}`).join('\n')}` : ''
  const tags = (await prisma.tag.findMany({ where: { status: 'AKTIV' } })).map((t) => t.name)
  return { optionen, anker, tags }
}

async function lauf() {
  const modell = process.env.AI_MODEL!
  const belege: Beleg[] = JSON.parse(await fs.readFile(TEXTE, 'utf8'))
  const ctx = Object.fromEntries(await Promise.all(DISZIPLINEN.map(async (d) => [d, await kontext(d)] as const)))
  const t0 = Date.now()
  const ergebnisse = await Promise.all(belege.map(async (b) => {
    const s = Date.now()
    try {
      const k = await klassifiziere(b.text!, ctx[b.disziplin].optionen, ctx[b.disziplin].tags, ctx[b.disziplin].anker)
      return { url: b.url, von: b.von, bis: b.bis, niveau: Math.round(k.niveau), didaktik: k.qualityScore, ms: Date.now() - s }
    } catch (e) {
      return { url: b.url, von: b.von, bis: b.bis, fehler: (e as Error).message.slice(0, 120), ms: Date.now() - s }
    }
  }))
  await fs.writeFile(path.join(DIR, `${modell.replace(/\//g, '_')}.json`), JSON.stringify({ modell, parallel: Number(process.env.AI_PARALLEL) || 12, verbrauch: aiVerbrauch, sekunden: (Date.now() - t0) / 1000, ergebnisse }))
  console.log(`${modell}: ${ergebnisse.filter((e) => 'niveau' in e).length}/${belege.length} ok, ${aiVerbrauch.kostenUsd.toFixed(3)} USD`)
}

// Spearman über Rangplätze (Bindungen gemittelt)
function spearman(a: number[], b: number[]): number {
  const rang = (x: number[]) => {
    const idx = x.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0])
    const r = new Array(x.length)
    for (let i = 0; i < idx.length;) {
      let j = i
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2
      i = j + 1
    }
    return r
  }
  const ra = rang(a), rb = rang(b), n = a.length
  const ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2 }
  return num / Math.sqrt(da * db)
}

async function bericht() {
  const dateien = (await fs.readdir(DIR)).filter((f) => f.endsWith('.json') && f !== 'texte.json')
  const zeilen: string[] = []
  for (const f of dateien) {
    const { modell, verbrauch, ergebnisse, sekunden, parallel } = JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8'))
    const ok = ergebnisse.filter((e: { niveau?: number }) => e.niveau != null)
    const bandVon = (v: number) => Math.floor((Math.max(1, v) - 1) / 20)
    const treffer = ok.filter((e: Beleg & { niveau: number }) => e.niveau >= e.von && e.niveau <= e.bis).length
    const nah = ok.filter((e: Beleg & { niveau: number }) => Math.abs(bandVon(e.niveau) - bandVon((e.von + e.bis) / 2)) <= 1).length
    const abstand = ok.reduce((s: number, e: Beleg & { niveau: number }) => s + Math.abs(e.niveau - (e.von + e.bis) / 2), 0) / ok.length
    const bias = ok.reduce((s: number, e: Beleg & { niveau: number }) => s + (e.niveau - (e.von + e.bis) / 2), 0) / ok.length // <0 = zu tief
    const rho = spearman(ok.map((e: Beleg) => (e.von + e.bis) / 2), ok.map((e: { niveau: number }) => e.niveau))
    const haeufig = new Map<number, number>()
    ok.forEach((e: { niveau: number }) => haeufig.set(e.niveau, (haeufig.get(e.niveau) ?? 0) + 1))
    const modus = Math.max(...haeufig.values())
    const proMaterial = verbrauch.kostenUsd / Math.max(1, verbrauch.aufrufe)
    zeilen.push(`| ${modell} | ${Math.round((treffer / ok.length) * 100)} % | ${Math.round((nah / ok.length) * 100)} % | ${abstand.toFixed(0)} | ${bias > 0 ? '+' : ''}${bias.toFixed(0)} | ${rho.toFixed(2)} | ${haeufig.size} | ${Math.round((modus / ok.length) * 100)} % | ${ergebnisse.length - ok.length} | ${(proMaterial * 100).toFixed(2)} ¢ | ${Math.round(proMaterial * 17000)} USD | ${Math.round(sekunden)} s${parallel && parallel !== 12 ? ` (${parallel} parallel)` : ''} |`)
  }
  console.log('| Modell | Band exakt | ±1 Band | Ø Abstand | Tendenz | Spearman | versch. Werte | häufigster | Ausfälle | pro Material | 17k Materialien | Dauer 115 Belege |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  console.log(zeilen.sort().join('\n'))
}

const modus = process.argv[2]
await (modus === 'texte' ? texte() : modus === 'lauf' ? lauf() : bericht())
await prisma.$disconnect()
