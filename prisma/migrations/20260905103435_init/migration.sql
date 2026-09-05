-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nickname" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "link" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Quelle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "fach" TEXT,
    "titel" TEXT,
    "beschreibung" TEXT,
    "qualityScore" INTEGER,
    "todesCounter" INTEGER NOT NULL DEFAULT 0,
    "etag" TEXT,
    "contentHash" TEXT,
    "lastCrawledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "melderId" INTEGER NOT NULL,
    CONSTRAINT "Quelle_melderId_fkey" FOREIGN KEY ("melderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fach" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lehrplanUrl" TEXT
);

-- CreateTable
CREATE TABLE "Lerngebiet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fachId" INTEGER NOT NULL,
    "nummer" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Lerngebiet_fachId_fkey" FOREIGN KEY ("fachId") REFERENCES "Fach" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Teilgebiet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lerngebietId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Teilgebiet_lerngebietId_fkey" FOREIGN KEY ("lerngebietId") REFERENCES "Lerngebiet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Kompetenz" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teilgebietId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "Kompetenz_teilgebietId_fkey" FOREIGN KEY ("teilgebietId") REFERENCES "Teilgebiet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Material" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quelleId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "zusammenfassung" TEXT NOT NULL,
    "contentHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Material_quelleId_fkey" FOREIGN KEY ("quelleId") REFERENCES "Quelle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialZuordnung" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materialId" INTEGER NOT NULL,
    "teilgebietId" INTEGER NOT NULL,
    "kompetenzId" INTEGER,
    CONSTRAINT "MaterialZuordnung_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialZuordnung_teilgebietId_fkey" FOREIGN KEY ("teilgebietId") REFERENCES "Teilgebiet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialZuordnung_kompetenzId_fkey" FOREIGN KEY ("kompetenzId") REFERENCES "Kompetenz" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIV'
);

-- CreateTable
CREATE TABLE "MaterialTag" (
    "materialId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    PRIMARY KEY ("materialId", "tagId"),
    CONSTRAINT "MaterialTag_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Upvote" (
    "userId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,

    PRIMARY KEY ("userId", "materialId"),
    CONSTRAINT "Upvote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Upvote_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TagVote" (
    "userId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    PRIMARY KEY ("userId", "tagId"),
    CONSTRAINT "TagVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TagVote_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Quelle_url_key" ON "Quelle"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Fach_code_key" ON "Fach"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Lerngebiet_fachId_nummer_key" ON "Lerngebiet"("fachId", "nummer");

-- CreateIndex
CREATE UNIQUE INDEX "Material_url_key" ON "Material"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
