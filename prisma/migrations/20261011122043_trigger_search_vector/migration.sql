-- Convert search_vector from a generated column to a trigger-maintained column.
-- Prisma can't express this natively; the column is declared as
-- Unsupported("tsvector") in schema.prisma and left unmanaged here.

ALTER TABLE "BlogPost" DROP COLUMN search_vector;
ALTER TABLE "BlogPost" ADD COLUMN search_vector tsvector;

UPDATE "BlogPost" SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B');

CREATE INDEX "BlogPost_search_vector_idx" ON "BlogPost" USING GIN (search_vector);

CREATE OR REPLACE FUNCTION blogpost_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blogpost_search_vector_trigger ON "BlogPost";

CREATE TRIGGER blogpost_search_vector_trigger
BEFORE INSERT OR UPDATE ON "BlogPost"
FOR EACH ROW EXECUTE FUNCTION blogpost_search_vector_update();