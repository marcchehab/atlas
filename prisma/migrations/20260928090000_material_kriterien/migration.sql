-- Kriterienkatalog: welche Tätigkeiten im Material vorkommen und wie zentral.
-- Daraus rechnet berechneNiveau() den Niveau-Score; niveauKi hält die direkte KI-Schätzung
-- als Rückfall (wenn kein Kriterium feuert) und als Vergleichswert.
ALTER TABLE "Material" ADD COLUMN "niveauKi" INTEGER;

CREATE TABLE "MaterialKriterium" (
    "materialId" INTEGER NOT NULL,
    "kriteriumId" TEXT NOT NULL,
    "gewicht" INTEGER NOT NULL,

    PRIMARY KEY ("materialId", "kriteriumId"),
    CONSTRAINT "MaterialKriterium_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MaterialKriterium_kriteriumId_idx" ON "MaterialKriterium"("kriteriumId");
