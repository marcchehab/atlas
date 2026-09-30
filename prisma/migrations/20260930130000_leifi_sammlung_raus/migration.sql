-- leifiphysik.de/sammlung/…: automatisch erzeugte Zusammenstellungen, die nur auf reguläre
-- Aufgabenseiten verlinken — der Crawler schliesst sie neu aus (AUSSCHLUESSE in crawler.ts).
-- Kind-Tabellen explizit (SQLite-Cascade greift in Migrationen nicht zuverlässig); FTS räumt der Trigger.
CREATE TEMP TABLE weg AS
SELECT id FROM "Material" WHERE url LIKE 'https://www.leifiphysik.de/sammlung/%' OR url LIKE 'https://leifiphysik.de/sammlung/%';
DELETE FROM "Upvote" WHERE materialId IN (SELECT id FROM weg);
DELETE FROM "MaterialTag" WHERE materialId IN (SELECT id FROM weg);
DELETE FROM "MaterialZuordnung" WHERE materialId IN (SELECT id FROM weg);
DELETE FROM "MaterialKriterium" WHERE materialId IN (SELECT id FROM weg);
DELETE FROM "Material" WHERE id IN (SELECT id FROM weg);
DROP TABLE weg;
