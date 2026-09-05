# Queue

## Doing

## To do (von oben nach unten, jeweils zu doing kopieren)

- Icon für die Seite (das im Tab erscheint)
- Tag- und Format-Filter im UI (analog Quellen-Filter)
- Tag-Vorschlags-Voting im UI (3 Votes → aktiv)
- Admin-UI: Tag-Kuration (Vorschläge freigeben/mergen/löschen)
- Admin-UI: abgelehnte Quellen/Materialien einsehen
- Admin-UI: Karte ausblenden
- Nickname ändern können
- Admin-UI: Lehrplan pro Fach erfassen/ändern
- Edulog als dritter Auth-Provider (braucht sponsernde Schule)

## Probably never
- Google-Drive-Connector
- Dropbox: List+Selektiv via Atlas-eigenem App-Token statt Zip

## Done

- Tote-Link-Mail an Melder:in bei Todescounter ≥ 3 (via Brevo)
- Rate-Limit beim Melden (20/Tag pro Konto), Warnmail an marc@informatikgarten.ch
- SSRF-Schutz (private IP-Ranges, nur http/https; ATLAS_ALLOW_PRIVATE=1 für lokale Tests)

- Prototyp: Melden → Crawl → AI-Klassifikation → Lehrplan-Baum
- Lehrplan-Hierarchie mit echten RLP-2024-Kompetenzen (GF Informatik)
- Sidebar-Layout im Eduskript-Look, Darkmode, Schriftgrösse, Pill-Bar
- Up-/Downvotes (Stack-Overflow-Stil)
- Volltextsuche (FTS5) inkl. Quellen-Erkennung in der Suche
- Quellen-Filter (persistent), klickbare Quelle auf Karten
- Website-Connector (Sitemap/Links, Text-Hash, Duplikat-/Übersichtsseiten-Filter)
- Git-Connector (Markdown pro Datei, LaTeX-Repos als ein Material)
- Cloud-Connector: SharePoint/OneDrive Business, OneDrive, Nextcloud (List+Selektiv), Dropbox (Zip)
- Videos per Dateiname indexiert
- Material.format deterministisch vom Crawler
- Umzugs-/Verschwinde-Erkennung (Content-Hash, fehlCounter)
- Auth: Microsoft OAuth (geteilte Entra-App) + Magic-Link via Brevo
- VPS-Deployment (Push-Deploy, Caddy/TLS, nächtlicher Crawl-Timer)
- Verschlüsseltes Backup nach Scaleway (nächtlich, Retention, restore-getestet)
- GitHub-Repo öffentlich (AGPL-3.0)
