-- SQLite indexiert Fremdschlüssel nicht automatisch. Ohne diese Indizes liefen die
-- verschachtelten Zuordnungs-Abfragen (Lehrplan-Übersicht, Teilgebiet-Seiten) über
-- Full Scans von MaterialZuordnung — 3–4 s pro Seite.
CREATE INDEX IF NOT EXISTS "Lehrplan_fachId_idx" ON "Lehrplan"("fachId");
CREATE INDEX IF NOT EXISTS "Teilgebiet_lerngebietId_idx" ON "Teilgebiet"("lerngebietId");
CREATE INDEX IF NOT EXISTS "Kompetenz_teilgebietId_idx" ON "Kompetenz"("teilgebietId");
CREATE INDEX IF NOT EXISTS "Material_quelleId_idx" ON "Material"("quelleId");
CREATE INDEX IF NOT EXISTS "MaterialZuordnung_materialId_idx" ON "MaterialZuordnung"("materialId");
-- zusammengesetzt (teilgebietId, materialId): die EXISTS-Abfragen «hat Material X eine
-- Zuordnung zu Teilgebiet Y» fanden per teilgebietId ~2000 Zeilen und scannten die pro Material.
DROP INDEX IF EXISTS "MaterialZuordnung_teilgebietId_idx";
DROP INDEX IF EXISTS "MaterialZuordnung_kompetenzId_idx";
CREATE INDEX IF NOT EXISTS "MaterialZuordnung_teilgebietId_materialId_idx" ON "MaterialZuordnung"("teilgebietId", "materialId");
CREATE INDEX IF NOT EXISTS "MaterialZuordnung_kompetenzId_materialId_idx" ON "MaterialZuordnung"("kompetenzId", "materialId");
CREATE INDEX IF NOT EXISTS "MaterialTag_tagId_idx" ON "MaterialTag"("tagId");
CREATE INDEX IF NOT EXISTS "Upvote_materialId_idx" ON "Upvote"("materialId");
CREATE INDEX IF NOT EXISTS "TagVote_tagId_idx" ON "TagVote"("tagId");
ANALYZE;
