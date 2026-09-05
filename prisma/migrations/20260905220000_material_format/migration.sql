ALTER TABLE "Material" ADD COLUMN "format" TEXT;
-- Backfill aus URL/Quelltyp (deterministisch)
UPDATE "Material" SET "format"='webseite' WHERE "quelleId" IN (SELECT id FROM "Quelle" WHERE typ='WEBSITE');
UPDATE "Material" SET "format"='repo' WHERE "quelleId" IN (SELECT id FROM "Quelle" WHERE typ='GIT');
UPDATE "Material" SET "format"='markdown' WHERE url LIKE '%/blob/HEAD/%';
UPDATE "Material" SET "format"='pdf' WHERE url LIKE '%#%.pdf';
UPDATE "Material" SET "format"='dokument' WHERE url LIKE '%#%.docx' OR url LIKE '%#%.odt' OR url LIKE '%#%.txt' OR url LIKE '%#%.tex';
UPDATE "Material" SET "format"='präsentation' WHERE url LIKE '%#%.pptx';
UPDATE "Material" SET "format"='markdown' WHERE url LIKE '%#%.md' OR url LIKE '%#%.markdown';
UPDATE "Material" SET "format"='webseite' WHERE url LIKE '%#%.html' OR url LIKE '%#%.htm';
UPDATE "Material" SET "format"='video' WHERE url LIKE '%#%.mp4' OR url LIKE '%#%.m4v' OR url LIKE '%#%.mov' OR url LIKE '%#%.webm' OR url LIKE '%#%.mkv' OR url LIKE '%#%.avi';
-- video-Tag entfällt: das Format weiss es deterministisch
DELETE FROM "MaterialTag" WHERE "tagId" IN (SELECT id FROM "Tag" WHERE name='video');
DELETE FROM "TagVote" WHERE "tagId" IN (SELECT id FROM "Tag" WHERE name='video');
DELETE FROM "Tag" WHERE name='video';
