# Kriterien Informatik

Die **Items sind die Quelle**: Jede Zeile ist eine Tätigkeit mit fester id und einem Niveau von
1 bis 100. Der Fach-Anker im Bewertungs-Prompt wird daraus erzeugt (eine Zeile pro Band, Items
nach Niveau sortiert) — er wird nirgends separat gepflegt.

Die KI erfasst pro Material nur, welche Tätigkeiten vorkommen und wie zentral (Gewicht 1–3).
Der Niveau-Score ist der gewichtete Median darüber; kommt keine vor, gilt die direkte Schätzung.

Format: `` `id` | niveau | Tätigkeit ``. Die ids sind fix — an ihnen hängen die Stimmen der
Lehrpersonen. Text ändern ist erlaubt, id ändern heisst: neue Tätigkeit ohne Vorgeschichte.
Das Band ergibt sich aus dem Niveau, die Überschriften sind nur zum Lesen.

## Sek I
- `block-prog` | 15 | Blockbasiert programmieren (Scratch, Blockly)
- `medienbildung` | 15 | Internet, Daten und Sicherheit im Alltag erklären (Medienbildung nach LP21 MI)

## Sek I erweitert / Progymnasium
- `binaer-spielerisch` | 30 | Binärzahlen spielerisch entdecken
- `geheimschrift-spielerisch` | 30 | Geheimschriften spielerisch entdecken
- `erste-textprogramme` | 32 | Erste Textprogramme nach Vorlage (TigerJython, «Einfach Informatik 7–9»)

## Grundlagenfach
- `zahlensysteme` | 44 | Zahlensysteme umrechnen
- `bildgroesse` | 44 | Bildgrösse und Datenmengen berechnen
- `pruefziffern` | 44 | Prüfziffern nachrechnen
- `caesar-vigenere` | 45 | Caesar/Vigenère anwenden
- `programme-lesen` | 45 | Programme lesen und erweitern
- `er-einfach` | 48 | Eine einfache Situation als ER-Modell darstellen
- `python-schleifen` | 48 | In Python von den ersten Schleifen bis zu eigenen Funktionen mit Listen programmieren
- `sortieren-suchen` | 50 | Sortieren und Suchen vergleichen
- `oop-nutzen` | 50 | Fertige Klassen und Objekte verwenden (Bibliotheken, Greenfoot/Kara)
- `automaten` | 52 | Einfache Abläufe als Zustandsdiagramm modellieren (Ampel, Kara)
- `projekt-angeleitet` | 54 | Angeleitetes Projekt umsetzen (Spiel, Simulation)
- `sql` | 55 | SQL-Abfragen schreiben
- `rekursion-einfach` | 55 | Einfache Rekursion nachvollziehen (Fakultät, Turtle-Baum)
- `rsa-klein` | 57 | RSA mit kleinen Zahlen durchrechnen
- `db-modellieren` | 60 | Datenbanken mit Beziehungstypen und Normalformen entwerfen

## Schwerpunkt-/Ergänzungsfach
- `oop-entwerfen` | 64 | Eigene Klassen und Vererbung entwerfen
- `rekursion` | 65 | Rekursive Algorithmen entwerfen und analysieren (Divide & Conquer)
- `datenstrukturen-impl` | 68 | Datenstrukturen selbst implementieren (Stack, Queue, Baum, Graph)
- `o-notation` | 68 | Laufzeit in O-Notation bestimmen
- `graphalgorithmen` | 70 | Graphalgorithmen (BFS, DFS, Dijkstra) implementieren und anwenden
- `berechenbarkeit` | 72 | Grenzen der Berechenbarkeit begründen (Halteproblem)
- `formale-sprachen` | 74 | Formale Sprachen mit Grammatiken beschreiben und erkennen
- `olympiade-r1` | 75 | Olympiade-Programmieraufgabe (SOI 1. Runde): eigenen effizienten Algorithmus finden und implementieren — Knobelaufgaben ohne Programmieren (Biber) gehören nicht dazu

## Hochschule
- `eth-erstes-jahr` | 85 | Aufgaben aus dem ersten Studienjahr lösen (ETH-Informatik)
- `korrektheitsbeweis` | 88 | Korrektheits- und Laufzeitbeweise führen
- `np-vollstaendigkeit` | 92 | NP-Vollständigkeit durch Reduktion beweisen
- `olympiade-final` | 92 | Aufgaben der Olympiade-Finalrunde lösen
