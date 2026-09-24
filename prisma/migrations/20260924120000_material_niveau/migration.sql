-- Niveau-Score (1–100, fachliches Anspruchsniveau), getrennt vom Didaktik-Score (qualityScore).
-- NULL = noch nicht bewertet.
ALTER TABLE "Material" ADD COLUMN "niveau" INTEGER;
