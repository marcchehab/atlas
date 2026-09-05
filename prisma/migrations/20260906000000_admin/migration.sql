ALTER TABLE "User" ADD COLUMN "istAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Material" ADD COLUMN "versteckt" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "istAdmin"=true WHERE email IN ('chris.hitch2@pm.me','marc@informatikgarten.ch','marc.chehab@fksz.ch');
