-- Local copy of the amoCRM data the reports read (src/vercel/_lib/amoMirror.js).
-- Downloading a month of deals / events from amoCRM on every report view got
-- the integration blocked by amoCRM; now the server keeps these in step
-- incrementally and the reports read them from here.

CREATE TABLE amo_mirror (
  tenant_id  text   NOT NULL,
  kind       text   NOT NULL,   -- 'lead' | 'note' | 'event'
  id         text   NOT NULL,   -- amo id (events have string ids)
  created_at bigint,            -- unix seconds, as amo gives them
  updated_at bigint,
  closed_at  bigint,
  type       text,              -- event / note type
  entity     text,              -- event entity_type ('lead', 'contact', …)
  data       jsonb  NOT NULL,   -- the amo object as the API returned it
  PRIMARY KEY (tenant_id, kind, id)
);
CREATE INDEX amo_mirror_created_idx ON amo_mirror (tenant_id, kind, created_at);
CREATE INDEX amo_mirror_closed_idx ON amo_mirror (tenant_id, closed_at) WHERE kind = 'lead';

-- One row per synced stream ('leads', 'notes', 'events:outgoing_call', …):
-- everything changed since covered_from up to cursor is in amo_mirror.
CREATE TABLE amo_mirror_state (
  tenant_id    text    NOT NULL,
  stream       text    NOT NULL,
  covered_from bigint  NOT NULL,
  cursor       bigint  NOT NULL,
  ready        boolean NOT NULL DEFAULT false,  -- backfill done: reports may read it
  synced_at    timestamptz,
  error        text,
  PRIMARY KEY (tenant_id, stream)
);
