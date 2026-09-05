-- FTS5-Volltextindex über Material (Prisma kennt FTS5 nicht — daher Roh-SQL).
CREATE VIRTUAL TABLE IF NOT EXISTS material_fts USING fts5(titel, zusammenfassung, content='Material', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS material_fts_ai AFTER INSERT ON "Material" BEGIN
  INSERT INTO material_fts(rowid, titel, zusammenfassung) VALUES (new.id, new.titel, new.zusammenfassung);
END;
CREATE TRIGGER IF NOT EXISTS material_fts_ad AFTER DELETE ON "Material" BEGIN
  INSERT INTO material_fts(material_fts, rowid, titel, zusammenfassung) VALUES ('delete', old.id, old.titel, old.zusammenfassung);
END;
CREATE TRIGGER IF NOT EXISTS material_fts_au AFTER UPDATE ON "Material" BEGIN
  INSERT INTO material_fts(material_fts, rowid, titel, zusammenfassung) VALUES ('delete', old.id, old.titel, old.zusammenfassung);
  INSERT INTO material_fts(rowid, titel, zusammenfassung) VALUES (new.id, new.titel, new.zusammenfassung);
END;
