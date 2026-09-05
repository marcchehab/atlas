// Mailversand über Brevo (gleiches Konto wie Eduskript).

export async function sendeMail(an: string, betreff: string, html: string, tag: string): Promise<void> {
  if (!process.env.BREVO_API_KEY) {
    console.log(`[Mail, kein BREVO_API_KEY] an ${an}: ${betreff}`)
    return
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      sender: { name: 'Atlas by Eduskript', email: process.env.EMAIL_FROM ?? 'noreply@eduskript.org' },
      to: [{ email: an }],
      subject: betreff,
      htmlContent: html,
      tags: [tag, 'no-tracking'],
    }),
  })
  if (!res.ok) throw new Error(`Brevo HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
}
