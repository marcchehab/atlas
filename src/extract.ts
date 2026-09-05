import { spawn } from 'node:child_process'
import path from 'node:path'

const TRAFILATURA = path.join(process.cwd(), '.venv', 'bin', 'trafilatura')

// Python nur als zustandsloses Werkzeug: HTML rein, Markdown raus. Kein DB-Zugriff.
export function extract(html: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(TRAFILATURA, ['--output-format', 'markdown'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0 && out.trim()) resolve(out.trim())
      else reject(new Error(`trafilatura exit ${code}: ${err.slice(0, 200)}`))
    })
    p.stdin.write(html)
    p.stdin.end()
  })
}

// Fallback, falls trafilatura nichts liefert (z.B. sehr kahle Seiten).
export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
