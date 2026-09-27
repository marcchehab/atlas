-- Stimmen von Lehrpersonen zum Niveau einer Tätigkeit aus dem Kriterienkatalog.
-- Pro Tätigkeit statt pro Material: ~40 Einträge pro Fach brauchen wenige Stimmen.
CREATE TABLE "KriteriumStimme" (
    "userId" INTEGER NOT NULL,
    "kriteriumId" TEXT NOT NULL,
    "niveau" INTEGER NOT NULL,

    PRIMARY KEY ("userId", "kriteriumId"),
    CONSTRAINT "KriteriumStimme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "KriteriumStimme_kriteriumId_idx" ON "KriteriumStimme"("kriteriumId");
