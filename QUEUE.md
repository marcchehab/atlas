# Queue

## Doing

## To do (von oben nach unten, jeweils zu doing kopieren)

- Admin-UI: Lehrplan pro Fach erfassen/ändern

## Probably never
- Edulog als dritter Auth-Provider (braucht sponsernde Schule)
- Google-Drive-Connector
- Dropbox: List+Selektiv via Atlas-eigenem App-Token statt Zip

## Done

- Buch-SPA-Connector (mygymer-Stil): config/config.json + book.json → offene .md-Dateien lesen, Permalinks ?b=&p=
- Eduskript-Verzeichnis-Sync (sites.json → Quellen, Opt-out drüben; Pfad-Scoping + Sitemap-Fallback im Spider)
- eduskript.org-Pfad-Sites gruppieren wie GitHub-User
- Quellen-Sperrliste: gelöschte Quellen werden vom Sync nicht wiederbelebt (Neu-Melden hebt auf)
- /quellen: leere/tote Quellen in zugeklapptem Bereich; Filterleiste nur Quellen mit Inhalten
- Async-Melden mit Live-Status-Seite; Quellen löschen (Admin alle, Melder:in eigene, dezenter Papierkorb)
- Rekursiver Link-Spider (BFS), cleanUrls-Retry, Deckel zählt AI-Verarbeitungen, Crawl-Fehler-Logging
- Admin: Tags inline umbenennen; AI-Vorschläge: Top 5 pro Lauf; max 5 Vorschlags-Chips
- Deploy-Hook wartet auf laufenden Crawl (Container-Rebuild killt exec)
- Resizeable Sidebar, Nickname-Dialog, Filter-Reset

- in den quellen, tags und format pills klein die aktuelle anzahl (muss sich natürilch anpassen wenn filter ändert)
- Nickname ändern können
- Favicon (Globus-Bildmarke, darkmode-fähig)
- Admin-UI: Tag-Kuration (Bulk-Freigeben/-Löschen, Mergen), abgelehnte Materialien, versteckte Materialien, tote Quellen
- Admin-UI: Karte ausblenden (✕ auf der Karte, Toggle)
- Tag-Vorschlags-Voting (gestrichelte Chips in der Tags-Filterzeile, 3 Votes → aktiv)
- Profil-Dropdown statt Direkt-Logout

- Tag- und Format-Filter im UI (analog Quellen-Filter)
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
