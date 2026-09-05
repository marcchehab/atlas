import { prisma, normalizeUrl } from './db.js'

// Eduskript-Verzeichnis-Sync: eduskript.org/api/sites.json listet alle öffentlichen
// Sites (Opt-out drüben). Läuft am Anfang des Nachtlaufs: fehlende Quellen anlegen,
// aus dem Verzeichnis verschwundene ausblenden (Todescounter 3), zurückgekehrte reaktivieren.
// Melder ist ein System-User — von Hand gemeldete Quellen (andere Melder) bleiben unberührt.

const VERZEICHNIS_URL = 'https://eduskript.org/api/sites.json'
const SYSTEM_EMAIL = 'system+eduskript@atlas.eduskript.org'

export async function syncEduskriptVerzeichnis(): Promise<string> {
  const res = await fetch(VERZEICHNIS_URL, {
    headers: { 'User-Agent': 'AtlasBot/0.1 (+https://atlas.eduskript.org)' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Verzeichnis HTTP ${res.status}`)
  const { sites } = (await res.json()) as { sites: { url: string; language?: string | null }[] }

  const system = await prisma.user.upsert({
    where: { email: SYSTEM_EMAIL },
    create: { email: SYSTEM_EMAIL, nickname: 'eduskript' },
    update: {},
  })

  const verzeichnisUrls = new Set<string>()
  let neu = 0
  for (const site of sites) {
    let url: string
    try { url = normalizeUrl(site.url) } catch { continue }
    verzeichnisUrls.add(url)
    const vorhanden = await prisma.quelle.findUnique({ where: { url } })
    if (vorhanden) {
      // Zurück im Verzeichnis → reaktivieren (nur System-Quellen anfassen)
      if (vorhanden.melderId === system.id && vorhanden.todesCounter >= 3) {
        await prisma.quelle.update({ where: { url }, data: { todesCounter: 0 } })
      }
      continue
    }
    await prisma.quelle.create({ data: { url, typ: 'WEBSITE', melderId: system.id } })
    neu++
  }

  // Vom System angelegte Quellen, die nicht mehr gelistet sind → ausblenden
  const systemQuellen = await prisma.quelle.findMany({ where: { melderId: system.id } })
  let ausgeblendet = 0
  for (const q of systemQuellen) {
    if (!verzeichnisUrls.has(q.url) && q.todesCounter < 3) {
      await prisma.quelle.update({ where: { id: q.id }, data: { todesCounter: 3 } })
      ausgeblendet++
    }
  }
  return `Eduskript-Verzeichnis: ${sites.length} Sites, ${neu} neue Quellen, ${ausgeblendet} ausgeblendet`
}
