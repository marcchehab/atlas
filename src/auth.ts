import crypto from 'node:crypto'
import { sendeMail } from './mail.js'

// Bewusst ohne better-auth: zwei Flows (Microsoft-Code-Flow, Magic-Link) direkt,
// weil better-auth eigene String-ID-Tabellen erzwingt, die nicht zu unserem
// Int-ID-Schema passen. Entra-App und Brevo werden von Eduskript mitgenutzt.

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const SECRET = process.env.SESSION_SECRET ?? 'dev'

// ---------- Microsoft OAuth (Entra, Tenant "common" = Schul- und Privatkonten) ----------

export const microsoftKonfiguriert = () =>
  !!(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET)

export function microsoftAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: `${BASE_URL}/api/auth/callback/microsoft`,
    scope: 'openid profile email',
    state,
    prompt: 'select_account',
  })
  const tenant = process.env.AZURE_AD_TENANT_ID || 'common'
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${p}`
}

// Code gegen id_token tauschen; Claims kommen direkt von Microsoft über TLS,
// deshalb reicht Dekodieren ohne eigene Signaturprüfung.
export async function microsoftCallback(code: string): Promise<{ email: string; name?: string }> {
  const tenant = process.env.AZURE_AD_TENANT_ID || 'common'
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${BASE_URL}/api/auth/callback/microsoft`,
    }),
  })
  if (!res.ok) throw new Error(`Token-Endpoint HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { id_token } = (await res.json()) as { id_token: string }
  const claims = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString()) as {
    email?: string
    preferred_username?: string
    name?: string
  }
  const email = (claims.email ?? claims.preferred_username ?? '').toLowerCase().trim()
  if (!email.includes('@')) throw new Error('Keine E-Mail in Microsoft-Claims')
  return { email, name: claims.name }
}

// ---------- Signierte Tokens (State + Magic-Link), kein DB-State nötig ----------

function signiere(daten: string): string {
  const mac = crypto.createHmac('sha256', SECRET).update(daten).digest('base64url')
  return `${Buffer.from(daten).toString('base64url')}.${mac}`
}

function verifiziere(token: string): string | null {
  const [datenB64, mac] = token.split('.')
  if (!datenB64 || !mac) return null
  const daten = Buffer.from(datenB64, 'base64url').toString()
  const erwartet = crypto.createHmac('sha256', SECRET).update(daten).digest('base64url')
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(erwartet))) return null
  return daten
}

export const neuerState = () => signiere(JSON.stringify({ n: crypto.randomBytes(8).toString('hex') }))
export const statePruefen = (token: string) => verifiziere(token) != null

export function magicToken(email: string): string {
  return signiere(JSON.stringify({ email, exp: Date.now() + 15 * 60 * 1000 }))
}

export function magicTokenPruefen(token: string): string | null {
  const daten = verifiziere(token)
  if (!daten) return null
  const { email, exp } = JSON.parse(daten) as { email: string; exp: number }
  return Date.now() < exp ? email : null
}

// ---------- Magic-Link-Versand ----------

export async function sendeMagicLink(email: string): Promise<void> {
  const link = `${BASE_URL}/api/auth/magic?token=${encodeURIComponent(magicToken(email))}`
  await sendeMail(
    email,
    'Dein Anmelde-Link für Atlas',
    `<p>Hallo!</p><p><a href="${link}">Bei Atlas anmelden</a> — der Link ist 15 Minuten gültig.</p><p>Falls du das nicht warst, ignoriere diese Mail.</p>`,
    'atlas-magic-link'
  )
}
