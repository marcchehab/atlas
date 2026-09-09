-- Fach (Informatik) und Lehrplan (Grundlagenfach Informatik) trennen.
-- Bisheriges "Fach" (code "informatik-gf") wird zum Lehrplan; das neue Fach wird aus dem
-- Code-Präfix abgeleitet. Lehrplan-IDs bleiben die alten Fach-IDs, damit Lerngebiet
-- nur die Spalte umbenennt.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

ALTER TABLE "Fach" RENAME TO "Fach_alt";
DROP INDEX "Fach_code_key"; -- hängt sonst noch an Fach_alt

CREATE TABLE "Fach" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL
);
CREATE UNIQUE INDEX "Fach_code_key" ON "Fach"("code");

-- Ein Fach pro Code-Präfix; Name vom ältesten Lehrplan (SQLite: bare columns folgen MIN(id))
INSERT INTO "Fach" ("code", "name")
SELECT fcode, fname FROM (
    SELECT
        CASE WHEN instr(code, '-') > 0 THEN substr(code, 1, instr(code, '-') - 1) ELSE code END AS fcode,
        CASE WHEN instr(name, ' (') > 0 THEN substr(name, 1, instr(name, ' (') - 1) ELSE name END AS fname,
        MIN(id)
    FROM "Fach_alt" GROUP BY fcode
);

CREATE TABLE "Lehrplan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "fachId" INTEGER NOT NULL,
    CONSTRAINT "Lehrplan_fachId_fkey" FOREIGN KEY ("fachId") REFERENCES "Fach" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Lehrplan_code_key" ON "Lehrplan"("code");

INSERT INTO "Lehrplan" ("id", "code", "name", "url", "fachId")
SELECT a.id, a.code,
    CASE WHEN a.code LIKE '%-gf' THEN 'Grundlagenfach'
         WHEN a.code LIKE '%-ef' THEN 'Ergänzungsfach'
         WHEN a.code LIKE '%-sf' THEN 'Schwerpunktfach'
         ELSE a.name END,
    a.lehrplanUrl, f.id
FROM "Fach_alt" a
JOIN "Fach" f ON f.code = CASE WHEN instr(a.code, '-') > 0 THEN substr(a.code, 1, instr(a.code, '-') - 1) ELSE a.code END;

CREATE TABLE "new_Lerngebiet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lehrplanId" INTEGER NOT NULL,
    "nummer" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Lerngebiet_lehrplanId_fkey" FOREIGN KEY ("lehrplanId") REFERENCES "Lehrplan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Lerngebiet" ("id", "lehrplanId", "nummer", "name") SELECT "id", "fachId", "nummer", "name" FROM "Lerngebiet";
DROP TABLE "Lerngebiet";
ALTER TABLE "new_Lerngebiet" RENAME TO "Lerngebiet";
CREATE UNIQUE INDEX "Lerngebiet_lehrplanId_nummer_key" ON "Lerngebiet"("lehrplanId", "nummer");

DROP TABLE "Fach_alt";

-- Fach-Hinweis der Melder:in zeigt neu aufs Fach statt auf den Lehrplan
UPDATE "Quelle" SET "fach" = substr("fach", 1, instr("fach", '-') - 1) WHERE "fach" IS NOT NULL AND instr("fach", '-') > 0;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
