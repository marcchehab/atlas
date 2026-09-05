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

- **Lehrplan-Hierarchie** Fach → Lerngebiet → Teilgebiet → Kompetenz; die echten 27 Kompetenzen des RLP 2024 (GF Informatik, PDF S. 69–70) sind erfasst. Material wird einem ganzen Teilgebiet oder einer einzelnen Kompetenz zugeordnet.
- **Sidebar-Navigation** (Fach-Dropdown + Lehrplan-Baum, Look angelehnt an Eduskript) mit Link aufs Original-PDF; rechts die Materialien.
- **Melden** (Login nötig): URL eingeben → sofortiger Crawl → trafilatura-Extraktion → AI-Klassifikation (Score, Titel, Zusammenfassung, Zuordnungen, Tags) → Material erscheint im Lehrplan-Baum. Score < 20 = abgelehnt.
- **Tag-Filter**, **Volltextsuche** (SQLite FTS5).
- **Upvotes** (Toggle, HTMX) — Ranking: Upvotes zuerst, AI-Score als Initial-Ranking.
- **Dedup** über normalisierte URL (utm-Params, Fragment, Trailing-Slash entfernt).
- **Re-Crawl** `npm run crawl`: ETag/Content-Hash-Änderungserkennung, Todescounter (3 Fehl-Nächte → ausgeblendet, Erfolg setzt zurück).

## Bewusste Prototyp-Abkürzungen (TODO produktiv)

- **Auth ist ein Stub** (Nickname + E-Mail, unverifiziert) → better-auth mit Microsoft OAuth + Magic-Link.
- **Eine Quelle = eine Seite.** Sitemap-Spidering, Git- und Cloud-Connectors fehlen noch (`erkenneTyp` erkennt sie nur).
- **Crawl beim Melden ist synchron** → produktiv nächtlicher Worker (Cron auf dem VPS: `docker compose exec app npm run crawl`).
- **Lehrplan-Erfassung nur per Seed** → Admin-UI, damit Admins pro Fach einen Lehrplan mit Ebenen erfassen können.
- Keine Mail bei totem Link, kein Rate-Limit, Tag-Vorschlags-Voting fehlt im UI (Modell existiert).
- SSRF-Schutz beim Fetchen (private IP-Ranges blocken).

## Deployment (VPS)

Läuft auf einem Infomaniak VPS Lite (`ov-dc1e03.infomaniak.ch`, Debian 13, User `debian`). Deploy = Push:

```sh
git push vps master   # post-receive-Hook: checkout → docker compose up -d --build → image prune
```

Compose: `app` (Node + trafilatura-venv) und `caddy` (Auto-TLS für atlas.eduskript.org; DNS bei Cloudflare, Record „DNS only"). SQLite liegt in `~/atlas/data/`. `.env` auf dem Server hat `SESSION_SECRET` und `OPENROUTER_API_KEY`. Nächtlicher Crawl: systemd-Timer `atlas-crawl.timer` (02:30 UTC), Logs via `journalctl -u atlas-crawl`. `deploy.sh` bleibt als manueller Fallback auf dem Server.
