import dns from 'node:dns/promises'
import net from 'node:net'

// SSRF-Schutz: Der Crawler fetcht beliebige gemeldete URLs — private/spezielle
// IP-Bereiche sind tabu, sonst kann man Atlas interne Endpunkte abfragen lassen.
// ATLAS_ALLOW_PRIVATE=1 schaltet das lokal für Entwicklung/Tests aus.

function istPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // Multicast/Reserved
  )
}

export function istPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return istPrivateV4(ip)
  const low = ip.toLowerCase()
  if (low === '::' || low === '::1') return true
  if (low.startsWith('::ffff:')) {
    const v4 = low.slice(7)
    return net.isIPv4(v4) ? istPrivateV4(v4) : true
  }
  return low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe8') || low.startsWith('fe9') || low.startsWith('fea') || low.startsWith('feb')
}

// Wirft bei privaten Zielen. Prüft alle DNS-Antworten (v4+v6).
export async function pruefeOeffentlich(url: string): Promise<void> {
  if (process.env.ATLAS_ALLOW_PRIVATE === '1') return
  const u = new URL(url)
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`Protokoll ${u.protocol} nicht erlaubt`)
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) {
    if (istPrivateIp(host)) throw new Error('private IP-Adresse nicht erlaubt')
    return
  }
  const adressen = await dns.lookup(host, { all: true, verbatim: true }).catch(() => [])
  if (!adressen.length) throw new Error('Hostname nicht auflösbar')
  for (const a of adressen) {
    if (istPrivateIp(a.address)) throw new Error('Hostname zeigt auf private IP-Adresse')
  }
}
