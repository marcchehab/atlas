-- Aufräumen: Website-Materialien, die direkt auf Downloads zeigen (.docx, .jar, .zip …).
-- Entstanden im ersten Crawl vor dem Content-Type-Filter; bei gedeckelten Quellen (swisseduc,
-- 800+ Seiten) läuft die Verschwinde-Erkennung nie, darum blieben sie liegen. Der Spider
-- folgt solchen Links jetzt gar nicht mehr; Cloud-/Git-Quellen (echte Datei-Materialien)
-- bleiben unberührt. FTS-Eintrag räumt der Delete-Trigger.
CREATE TEMP TABLE weg AS
SELECT m.id FROM "Material" m JOIN "Quelle" q ON q.id = m.quelleId
WHERE q.typ = 'WEBSITE' AND (
    lower(m.url) LIKE '%.docx' OR lower(m.url) LIKE '%.doc' OR lower(m.url) LIKE '%.odt' OR
    lower(m.url) LIKE '%.pptx' OR lower(m.url) LIKE '%.ppt' OR lower(m.url) LIKE '%.odp' OR
    lower(m.url) LIKE '%.xlsx' OR lower(m.url) LIKE '%.xls' OR lower(m.url) LIKE '%.ods' OR
    lower(m.url) LIKE '%.jar' OR lower(m.url) LIKE '%.war' OR lower(m.url) LIKE '%.class' OR
    lower(m.url) LIKE '%.exe' OR lower(m.url) LIKE '%.msi' OR lower(m.url) LIKE '%.dmg' OR lower(m.url) LIKE '%.apk' OR
    lower(m.url) LIKE '%.zip' OR lower(m.url) LIKE '%.tar' OR lower(m.url) LIKE '%.gz' OR lower(m.url) LIKE '%.tgz' OR
    lower(m.url) LIKE '%.7z' OR lower(m.url) LIKE '%.rar'
);
DELETE FROM "Upvote" WHERE materialId IN (SELECT id FROM weg);
DELETE FROM "MaterialTag" WHERE materialId IN (SELECT id FROM weg);
DELETE FROM "MaterialZuordnung" WHERE materialId IN (SELECT id FROM weg);
DELETE FROM "Material" WHERE id IN (SELECT id FROM weg);
DROP TABLE weg;
