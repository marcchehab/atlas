# Kriterienkatalog Informatik

Die Anker in `informatik.md` in einzelne **Tätigkeiten** aufgebrochen. Die KI erfasst pro Material
nur, welche davon vorkommen und wie zentral (Gewicht 1–3, nicht Genanntes zählt nicht mit). Der
Niveau-Score ist daraus der gewichtete Median. Das Niveau einer Tätigkeit ist Daten, keine
Modellausgabe — es lässt sich später per Voting korrigieren, ohne neu zu crawlen.

Format: `` `id` | niveau | Tätigkeit ``. Die ids sind fix, an ihnen hängen später die Stimmen.
Text ändern ist erlaubt, id ändern heisst: neue Tätigkeit ohne Vorgeschichte.

Herkunft: im September 2026 aus den Ankern abgeleitet, Niveaus an die gekürzte Fassung vom 27.9.
angeglichen. Ein Catch-all-Item «Übersichtsdarstellung» gab es zwischenzeitlich; es zog alles
Unpassende auf 50 und ist wieder raus.

## Programmieren
- `prog-block` | 15 | Blockbasiert programmieren (Scratch, Blockly, Sprites bewegen)
- `prog-anleitung` | 32 | Ein Programm Schritt für Schritt nach Anleitung nachbauen oder abtippen (erste Turtle-Figur, erste Schleife)
- `prog-lesen` | 45 | Gegebenen Code von Hand durchspielen und die Ausgabe vorhersagen, Bausteine im Code benennen
- `prog-erweitern` | 46 | Ein bestehendes, weitgehend vorgegebenes Programm gezielt ergänzen oder anpassen
- `prog-entwerfen` | 52 | Eigene Funktionen mit Parametern, Listen und Verzweigungen selbst entwerfen
- `prog-testen` | 50 | Fehler systematisch suchen, Testfälle bilden, Robustheit des Programms begründen
- `prog-projekt` | 52 | Ein grösseres angeleitetes Projekt umsetzen (Spiel, Simulation, App) über mehrere Lektionen
- `prog-oop-nutzen` | 46 | Fertige Objekte, Klassen oder Bibliotheken verwenden
- `prog-oop-entwerfen` | 64 | Eigene Klassen, Schnittstellen und Vererbung selbst entwerfen
- `prog-rekursion` | 65 | Rekursive Lösungen entwerfen, Rekursionstiefe und Stack begründen
- `prog-datenstruktur` | 68 | Nichttriviale Datenstrukturen selbst implementieren (Stack, Queue, Baum, Graph, Hashtabelle)

## Daten und Codierung
- `code-umrechnen` | 44 | Zahlensysteme nach Schema umrechnen (binär, hexadezimal, dezimal), Stellenwerttabelle anwenden
- `code-rechnen` | 45 | Datenmengen ausrechnen (Bildgrösse aus Auflösung x Farbtiefe, Kompressionsrate, Speicherbedarf)
- `code-pruefziffer` | 43 | Prüfziffer oder Paritätsbit nach Verfahren nachrechnen (EAN, ISBN, Paritätscode)
- `code-verallgemeinern` | 56 | Stellenwertsysteme allgemein erklären (beliebige Basis, Grenzen fester Bitlänge, Zweierkomplement)
- `code-verfahren` | 56 | Ein Codierungsverfahren konstruieren und seinen Nutzen begründen (Huffman-Baum und Ersparnis, Lauflängen)
- `code-grenzen` | 58 | Grenzen der Codierung fachlich begründen (Gleitkomma-Rundung, Informationsgehalt, verlustbehaftet vs. verlustfrei)

## Kryptologie
- `kry-anwenden` | 44 | Klassische Verfahren von Hand anwenden (Caesar, Vigenere, Skytale)
- `kry-prinzip` | 53 | Verschlüsselungsprinzipien erklären und Sicherheit begründen (symmetrisch vs. asymmetrisch, Schlüsseltausch)
- `kry-rsa` | 56 | RSA mit kleinen Primzahlen durchrechnen und in Code umsetzen
- `kry-beweis` | 72 | Kryptografische Verfahren zahlentheoretisch begründen (Euler, Fermat, Korrektheit von RSA)

## Algorithmen
- `alg-durchspielen` | 44 | Ein Verfahren an einem Beispiel von Hand durchspielen (Sortieren mit Karten, binäre Suche auf Papier)
- `alg-vergleichen` | 52 | Verfahren beschreiben, vergleichen und die Schrittzahl in Abhängigkeit von n begründen (ohne O-Notation)
- `alg-onotation` | 66 | Laufzeit formal in O-Notation bestimmen, Best/Worst/Average Case unterscheiden
- `alg-graph` | 70 | Graphalgorithmen anwenden oder implementieren (BFS, DFS, Dijkstra, MST)
- `alg-entwerfen` | 72 | Zu einem offenen Problem selbst einen effizienten Algorithmus finden und implementieren
- `alg-optimieren` | 84 | Fortgeschrittene Entwurfstechniken (dynamische Programmierung, Greedy mit Beweis, Segmentbaum)
- `alg-beweis` | 85 | Korrektheit per Induktion beweisen oder untere Schranken herleiten

## Theoretische Informatik
- `th-automat` | 52 | Einen Ablauf als endlichen Automaten modellieren (Zustandstabelle, Umsetzung mit if/elif), halbformal
- `th-formal` | 70 | Formale Sprachen, Grammatiken und reguläre Ausdrücke formal behandeln
- `th-berechenbarkeit` | 68 | Berechenbarkeit, Entscheidbarkeit und P vs. NP an Beispielen diskutieren (SAT, TSP, Halteproblem)
- `th-reduktion` | 88 | Formale Reduktions- und NP-Vollständigkeitsbeweise führen, Turingmaschinen formal

## Datenbanken und Systeme
- `db-abfrage` | 54 | SQL-Abfragen über mehrere Tabellen schreiben (Join, Gruppierung)
- `db-modellieren` | 60 | Datenbanken modellieren und normalisieren (ER-Modell, Normalformen)
- `sys-beschreiben` | 18 | Informatiksysteme und Internetdienste beschreiben und einordnen (EVA, Client-Server, Dienst vs. Infrastruktur)
- `sys-erklaeren` | 54 | Funktionsweise eines Systems technisch erklären (Protokollschichten, Routing, Speicherhierarchie, Betriebssystem)
- `ki-konzepte` | 56 | Konzepte des maschinellen Lernens erklären oder anwenden (Training, Merkmale, neuronales Netz)

## Uebergreifend
- `knobel` | 25 | Knobelaufgabe ohne Vorwissen: eine gegebene Regel befolgen, ein Muster erkennen (Biber-Stil)
- `werkzeug` | 30 | Eine Anwendungssoftware Klick für Klick nach Anleitung bedienen, ohne eigene Modellierung (Bildbearbeitung, Blender, CAD, Videoschnitt)
- `gesellschaft` | 32 | Folgen und Risiken der Informatik diskutieren (Datenschutz, Urheberrecht, KI-Ethik, Sicherheit im Netz)
