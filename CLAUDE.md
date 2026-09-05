# Atlas

Zentraler Sammlungsdienst für Unterrichtsmaterialien an Schweizer Gymnasien — geplant als `atlas.eduskript.org`. Startet mit dem Grundlagenfach Informatik, ist aber von Anfang an fächerneutral gedacht.

## Idee

Lehrpersonen melden nur einen Link auf ihre Quelle an — den Rest macht der Dienst:

1. **Connectors** ziehen das Material automatisiert zusammen (Websites/Crawler, Cloud-Speicher, Git-Repos). Nur gelesen, nicht konvertiert — die Sammlung speichert hauptsächlich Links (entschärft die Urheberrechtsfrage).
2. **Eine AI** ordnet jedes Material den Lernzielen des Lehrplans zu und erzeugt pro Eintrag: Mini-Zusammenfassung + Link auf die Originalquelle + Tags.
3. **Raster:** Rahmenlehrplan Maturitätsschulen (EDK, 2024), feinste Lernziel-Ebene. Für Informatik: Kapitel Grundlagenfach ab S. 67. Deckt ein Material mehrere Ziele ab, gibt es mehrere Einträge. (Lektionendotation regelt der RLP nicht — kantonal.)
4. **Tags** (z.B. python, spielerisch, formell): kuratiertes Set; die AI darf neue vorschlagen, ein Vorschlag mit 3 Upvotes wird zum Tag, Admins können direkt erstellen.
5. **Upvotes** auch auf Materialien → Ranking innerhalb eines Lernziels.
6. **Registrierung** so schlank wie möglich: Nickname, E-Mail, Link. Keine Schulzugehörigkeit, keine Qualitätskontrolle — Vertrauen in die Community.
7. **Scope:** erstmal nur Deutschschweiz; perspektivisch alle Fächer, evtl. weitere Sprachregionen.

## Eduskript-Integration

Eigenständiges Projekt. Eduskript wird ein normaler Connector — keine Spezial-API, nur crawlfreundlich (Sitemap mit lastmod, Markdown-Export pro Seite). Eduskript bekommt umgekehrt eine Anbindung, um Atlas direkt zu durchsuchen.

## Technik (Skizze)

- **AI:** Gemini Flash Lite fürs Mapping/Taggen/Zusammenfassen — Klassifikation gegen fixe Lernziel-/Tag-Liste als erzwungenes strukturiertes Output (Enum). 50 Dokumente von Hand stichproben, nur bei Schrott Modell hochstufen.
- **Re-Crawling:** nächtlicher Cron, zweistufig — billige Änderungserkennung zuerst (git diff, Sitemap-lastmod, ETag, Content-Hash), nur Geändertes zur AI. Tote Links nach 3 fehlgeschlagenen Nächten ausblenden + Besitzer:in mailen.
- **Hosting:** klein — 2-vCPU-VPS bei Infomaniak reicht für ~100 Quellen/Nacht (I/O-bound; die AI-Last liegt beim API-Anbieter).

## Stack (entschieden)

Node-Monolith, so wenig bewegliche Teile wie möglich:

- **Sprache:** Node/TypeScript für alles, was denkt — App, Connectors, Worker. Eine Codebase, geteilte Models.
- **DB:** SQLite (WAL-Modus) via **Prisma**. Volltextsuche mit FTS5 (Prisma kennt FTS5 nicht → Tabelle + Trigger per Migration-SQL, Abfragen via `$queryRaw`). Kein pgvector am Start: primärer Zugang ist Lernziel-Navigation + Tag-Filter, Freitext deckt FTS5 ab. Migration zu Postgres später ist billig (Prisma-Provider wechseln, Daten rüberkopieren), solange keine SQLite-Spezialtricks im Schema landen.
- **Frontend:** server-rendered HTML + HTMX (Upvotes, Tag-Vorschläge als Snippets), kein separates JS-Frontend.
- **Extraktion:** Python nur als zustandsloses Werkzeug — **trafilatura** als CLI/Subprozess (HTML rein, Text raus), kein DB-Zugriff, keine eigenen Models. Im Dockerfile installiert wie git/rclone.
- **Worker/Cron:** nächtlicher Crawl als eigenes Node-Skript (gleiche Prisma-Models), gestartet per systemd-timer/Cron. Kein Redis, keine Queue.
- **AI:** Gemini Flash Lite via `@google/genai`, structured output mit Enum-Constraint.
- **Auth:** better-auth mit Microsoft OAuth (Zielgruppe ist auf M365 eingeloggt → Voting bleibt Zwei-Klick) + Magic-Link als Fallback, Versand über Infomaniak-SMTP. Lesen/Suchen komplett offen; Melden und Upvoten nur mit Login (Kostenbremse: jede gemeldete URL erzeugt dauerhafte Crawl-/AI-Last).
- **Quellen-Modell:** Dedup über normalisierte URL (kein Duplikat bei erneuter Meldung; gleiche Domain schon vorhanden → Admin-Merge-Vorschlag). Man darf fremde öffentliche Inhalte melden; kein Besitzer-Konzept, Tote-Link-Mails gehen an die Melder:in. Pro Quelle: `quality_score` 0–100 von der AI (<20 = nicht aufgenommen; dient als Aufnahme-Filter und Initial-Ranking, danach übernehmen Upvotes) + Todescounter (fehlgeschlagene Crawl-Nächte in Folge, ab 3 ausgeblendet + Mail, Erfolg setzt zurück). Erfasst wird nur die URL (+ Connector-Typ, meist auto-erkannt; optional Fach) — Titel/Beschreibung extrahiert die AI beim ersten Crawl.
- **Deployment:** Docker Compose mit 2 Services (app, **Caddy** als Reverse Proxy mit Auto-TLS). Updates: `git pull && docker compose up -d --build` (`deploy.sh` im Repo).
- **Backup:** nächtlich SQLite-Datei kopieren (`sqlite3 .backup`) + rclone extern.

## Kontext

- Brainstorming-Notizen: `~/Documents/1_Projekte/ginf-materialsammlung.md`
- Rahmenlehrplan-PDF: https://edudoc.ch/record/232281/files/Rahmenlehrplan-maturitatsschulen.pdf
- Abgestimmt mit Werner/Rocco (SVIA-Kontext), E-Mail vom 2026-09-05.
