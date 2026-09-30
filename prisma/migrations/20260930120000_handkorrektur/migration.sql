-- Handkorrektur pro Material: Content-Hash zum Zeitpunkt der Korrektur (solange der Inhalt gleich
-- bleibt, überschreibt kein Crawl die Korrektur) und optional ein direkt gesetzter Niveau-Wert.
ALTER TABLE "Material" ADD COLUMN "korrekturHash" TEXT;
ALTER TABLE "Material" ADD COLUMN "niveauManuell" INTEGER;
