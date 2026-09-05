import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

// FTS5 kennt Prisma nicht — virtuelle Tabelle + Trigger idempotent beim Start anlegen.
export async function initDb() {
  await prisma.$queryRawUnsafe(`PRAGMA journal_mode=WAL`)
  await prisma.$executeRawUnsafe(
    `CREATE VIRTUAL TABLE IF NOT EXISTS material_fts USING fts5(titel, zusammenfassung, content='Material', content_rowid='id')`
  )
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER IF NOT EXISTS material_fts_ai AFTER INSERT ON "Material" BEGIN
       INSERT INTO material_fts(rowid, titel, zusammenfassung) VALUES (new.id, new.titel, new.zusammenfassung);
     END`
  )
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER IF NOT EXISTS material_fts_ad AFTER DELETE ON "Material" BEGIN
       INSERT INTO material_fts(material_fts, rowid, titel, zusammenfassung) VALUES ('delete', old.id, old.titel, old.zusammenfassung);
     END`
  )
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER IF NOT EXISTS material_fts_au AFTER UPDATE ON "Material" BEGIN
       INSERT INTO material_fts(material_fts, rowid, titel, zusammenfassung) VALUES ('delete', old.id, old.titel, old.zusammenfassung);
       INSERT INTO material_fts(rowid, titel, zusammenfassung) VALUES (new.id, new.titel, new.zusammenfassung);
     END`
  )
}

// utm-Params, Fragment und Trailing-Slash weg — Basis für die Dedup.
export function normalizeUrl(raw: string): string {
  const u = new URL(raw.trim())
  u.hash = ''
  for (const key of [...u.searchParams.keys()]) {
    if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') u.searchParams.delete(key)
  }
  u.hostname = u.hostname.toLowerCase()
  let s = u.toString()
  if (u.pathname !== '/' && s.endsWith('/')) s = s.slice(0, -1)
  return s
}

export function erkenneTyp(url: string): 'WEBSITE' | 'GIT' | 'CLOUD' {
  const u = new URL(url)
  const host = u.hostname.replace(/^www\./, '')
  if (url.endsWith('.git') || ['github.com', 'gitlab.com', 'codeberg.org'].includes(host)) return 'GIT'
  if (['dropbox.com', '1drv.ms', 'onedrive.live.com'].includes(host)) return 'CLOUD'
  if (/^\/s\/[^/]+\/?$/.test(u.pathname)) return 'CLOUD' // Nextcloud/ownCloud-Freigabelink
  return 'WEBSITE'
}
