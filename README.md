# Atlas — Prototyp

Sammlungsdienst für Unterrichtsmaterialien an Schweizer Gymnasien. Konzept und Stack-Entscheide: siehe `CLAUDE.md`.

## Lokal starten

```sh
npm install
python3 -m venv .venv && .venv/bin/pip install trafilatura
npx prisma migrate dev
npm run seed        # Platzhalter-Lernziele + Tags
npm run dev         # http://localhost:3000
```

Ohne `GEMINI_API_KEY` in `.env` läuft ein Mock-Klassifikator (Keyword-Heuristik) — die ganze Pipeline funktioniert offline. Mit Key übernimmt Gemini Flash Lite.

## Was der Prototyp kann

- **Melden** (Login nötig): URL eingeben → sofortiger Crawl → trafilatura-Extraktion → AI-Klassifikation (Score, Titel, Zusammenfassung, Lernziele, Tags) → Material erscheint unter den Lernzielen. Score < 20 = abgelehnt.
- **Lernziel-Navigation** (primärer Zugang), **Tag-Filter**, **Volltextsuche** (SQLite FTS5).
- **Upvotes** (Toggle, HTMX) — Ranking: Upvotes zuerst, AI-Score als Initial-Ranking.
- **Dedup** über normalisierte URL (utm-Params, Fragment, Trailing-Slash entfernt).
- **Re-Crawl** `npm run crawl`: ETag/Content-Hash-Änderungserkennung, Todescounter (3 Fehl-Nächte → ausgeblendet, Erfolg setzt zurück).

## Bewusste Prototyp-Abkürzungen (TODO produktiv)

- **Auth ist ein Stub** (Nickname + E-Mail, unverifiziert) → better-auth mit Microsoft OAuth + Magic-Link.
- **Eine Quelle = eine Seite.** Sitemap-Spidering, Git- und Cloud-Connectors fehlen noch (`erkenneTyp` erkennt sie nur).
- **Crawl beim Melden ist synchron** → produktiv nächtlicher Worker (Cron auf dem VPS: `docker compose exec app npm run crawl`).
- **Lernziele sind Platzhalter** → echte RLP-2024-Ziele (feinste Ebene, GF Informatik ab S. 67) importieren.
- Keine Mail bei totem Link, kein Rate-Limit, Tag-Vorschlags-Voting fehlt im UI (Modell existiert).
- SSRF-Schutz beim Fetchen (private IP-Ranges blocken).

## Deployment (VPS)

```sh
./deploy.sh    # = git pull && docker compose up -d --build
```

Compose: `app` (Node + trafilatura-venv) und `caddy` (Auto-TLS für atlas.eduskript.org). SQLite liegt in `./data/` (Backup = Datei kopieren). `.env` auf dem Server mit echtem `SESSION_SECRET` und `GEMINI_API_KEY` anlegen.
