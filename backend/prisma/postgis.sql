-- PostGIS bootstrap + spatial indexes.
-- Idempotent: safe to re-run after every `prisma db push`.

CREATE EXTENSION IF NOT EXISTS postgis;

-- GIST indexes for radius queries. Prisma cannot express GIST on an
-- Unsupported() column, so they live here.
CREATE INDEX IF NOT EXISTS users_geom_idx   ON "users"   USING GIST (geom);
CREATE INDEX IF NOT EXISTS intents_geom_idx ON "intents" USING GIST (geom);
CREATE INDEX IF NOT EXISTS posts_geom_idx   ON "posts"   USING GIST (geom);

-- Keep geom in lockstep with lat/lng no matter which code path writes them.
CREATE OR REPLACE FUNCTION daffodils_sync_geom() RETURNS trigger AS $$
BEGIN
  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    NEW.geom := NULL;
  ELSE
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_geom_sync   ON "users";
DROP TRIGGER IF EXISTS intents_geom_sync ON "intents";
DROP TRIGGER IF EXISTS posts_geom_sync   ON "posts";

CREATE TRIGGER users_geom_sync   BEFORE INSERT OR UPDATE OF lat, lng ON "users"
  FOR EACH ROW EXECUTE FUNCTION daffodils_sync_geom();
CREATE TRIGGER intents_geom_sync BEFORE INSERT OR UPDATE OF lat, lng ON "intents"
  FOR EACH ROW EXECUTE FUNCTION daffodils_sync_geom();
CREATE TRIGGER posts_geom_sync   BEFORE INSERT OR UPDATE OF lat, lng ON "posts"
  FOR EACH ROW EXECUTE FUNCTION daffodils_sync_geom();

-- Supporting indexes for the hot feed / broadcast paths.
CREATE INDEX IF NOT EXISTS intents_active_idx
  ON "intents" (status, "expiresAt") WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS posts_published_idx
  ON "posts" ("createdAt" DESC) WHERE status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS users_interest_tags_idx
  ON "users" USING GIN ("interestTags");
