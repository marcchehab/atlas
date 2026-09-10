-- Begriffe geradeziehen: bisheriges "Fach" (Informatik) heisst neu Disziplin, bisheriger
-- "Lehrplan" (Grundlagenfach Informatik) heisst neu Fach — wie im RLP 2024, der Grundlagen-,
-- Ergänzungs- und Schwerpunktfächer "Fächer" nennt. Fach bekommt ein Kürzel (Dropdown).
-- IDs und Codes bleiben, nur Tabellen/Spalten werden umbenannt.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

ALTER TABLE "Fach" RENAME TO "Disziplin";
DROP INDEX "Fach_code_key";
CREATE UNIQUE INDEX "Disziplin_code_key" ON "Disziplin"("code");

-- Lehrplan → Fach, neu aufgebaut (Spalte kuerzel NOT NULL ohne Default, Constraint-Namen)
CREATE TABLE "Fach" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "kuerzel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "disziplinId" INTEGER NOT NULL,
    CONSTRAINT "Fach_disziplinId_fkey" FOREIGN KEY ("disziplinId") REFERENCES "Disziplin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Kürzel und volle Namen für die bekannten Fächer (Seed überschreibt sie ohnehin)
INSERT INTO "Fach" ("id", "code", "kuerzel", "name", "url", "disziplinId")
SELECT l."id", l."code",
    CASE l."code"
        WHEN 'informatik-gf' THEN 'Ginf'
        WHEN 'informatik-spf-ag' THEN 'Sinf AG'
        WHEN 'physik-gf' THEN 'Gphy'
        WHEN 'mathematik-gf' THEN 'Gmat'
        ELSE upper(l."code") END,
    CASE WHEN l."name" IN ('Grundlagenfach', 'Ergänzungsfach', 'Schwerpunktfach') THEN l."name" || ' ' || d."name" ELSE l."name" END,
    l."url", l."fachId"
FROM "Lehrplan" l JOIN "Disziplin" d ON d."id" = l."fachId";
DROP TABLE "Lehrplan";
CREATE UNIQUE INDEX "Fach_code_key" ON "Fach"("code");
CREATE INDEX "Fach_disziplinId_idx" ON "Fach"("disziplinId");

-- Lerngebiet.lehrplanId → fachId
CREATE TABLE "new_Lerngebiet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fachId" INTEGER NOT NULL,
    "nummer" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Lerngebiet_fachId_fkey" FOREIGN KEY ("fachId") REFERENCES "Fach" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Lerngebiet" ("id", "fachId", "nummer", "name") SELECT "id", "lehrplanId", "nummer", "name" FROM "Lerngebiet";
DROP TABLE "Lerngebiet";
ALTER TABLE "new_Lerngebiet" RENAME TO "Lerngebiet";
CREATE UNIQUE INDEX "Lerngebiet_fachId_nummer_key" ON "Lerngebiet"("fachId", "nummer");

-- Disziplin-Hinweis der Melder:in
ALTER TABLE "Quelle" RENAME COLUMN "fach" TO "disziplin";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
