-- Version der Bewertung (Hash aus Modell + Prompt + Fach-Ankern + Katalog). NULL = unbekannt, d.h.
-- veraltet: bestehende Materialien werden nach und nach im nächtlichen Crawl neu bewertet.
ALTER TABLE "Material" ADD COLUMN "bewertungsVersion" TEXT;
