-- CRM (replaces amoCRM). Unlike the ERP document tables this is fully
-- relational from day one: funnels, conversion and response-time reports
-- are plain SQL over crm_leads + crm_activities.
--
-- amo_id columns make the amoCRM import re-runnable: a second run updates
-- the rows it created earlier instead of duplicating them.

CREATE TABLE crm_pipelines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  name        text NOT NULL,
  sort        integer NOT NULL DEFAULT 0,
  is_default  boolean NOT NULL DEFAULT false,
  archived    boolean NOT NULL DEFAULT false,
  amo_id      bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, amo_id)
);
CREATE INDEX crm_pipelines_tenant_idx ON crm_pipelines (tenant_id);
-- At most one default pipeline per school (new leads land there).
CREATE UNIQUE INDEX crm_pipelines_one_default ON crm_pipelines (tenant_id) WHERE is_default;

-- kind: open — work in progress; won / lost — terminal (amo 142 / 143).
-- The «Неразобранное» stage is an ordinary open stage with is_inbox = true.
CREATE TABLE crm_stages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  pipeline_id  uuid NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  name         text NOT NULL,
  color        text,
  sort         integer NOT NULL DEFAULT 0,
  kind         text NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'won', 'lost')),
  is_inbox     boolean NOT NULL DEFAULT false,
  amo_id       bigint,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- amo reuses status ids 142/143 in every pipeline → unique per pipeline
  UNIQUE (pipeline_id, amo_id)
);
CREATE INDEX crm_stages_pipeline_idx ON crm_stages (pipeline_id, sort);

-- phones: normalised digits with country code ('998901234567'), see
-- src/lib/phone.js. Duplicate detection searches this array.
CREATE TABLE crm_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text NOT NULL,
  name            text NOT NULL DEFAULT '',
  phones          text[] NOT NULL DEFAULT '{}',
  email           text,
  instagram       text,
  telegram_id     text,
  telegram_username text,
  student_id      text REFERENCES students(id) ON DELETE SET NULL,
  responsible_id  text REFERENCES employees(id) ON DELETE SET NULL,
  source          text,
  custom          jsonb NOT NULL DEFAULT '{}'::jsonb,
  amo_id          bigint,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (tenant_id, amo_id)
);
CREATE INDEX crm_contacts_tenant_idx ON crm_contacts (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX crm_contacts_phones_idx ON crm_contacts USING gin (phones);
CREATE INDEX crm_contacts_name_trgm_idx ON crm_contacts USING gin (name gin_trgm_ops);
CREATE INDEX crm_contacts_student_idx ON crm_contacts (student_id);
CREATE UNIQUE INDEX crm_contacts_telegram_idx ON crm_contacts (tenant_id, telegram_id) WHERE telegram_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX crm_contacts_instagram_idx ON crm_contacts (tenant_id, instagram) WHERE instagram IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE crm_leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         text NOT NULL,
  title             text NOT NULL DEFAULT '',
  contact_id        uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  pipeline_id       uuid NOT NULL REFERENCES crm_pipelines(id),
  stage_id          uuid NOT NULL REFERENCES crm_stages(id),
  responsible_id    text REFERENCES employees(id) ON DELETE SET NULL,
  -- instagram | instagram_comment | telegram | landing | call | manual | amo …
  source            text,
  branch_id         text,
  course_id         text,
  amount            numeric(14, 0) NOT NULL DEFAULT 0,
  tags              text[] NOT NULL DEFAULT '{}',
  custom            jsonb NOT NULL DEFAULT '{}'::jsonb,
  loss_reason       text,
  -- set when the lead is won and a student / first payment is created
  student_id        text REFERENCES students(id) ON DELETE SET NULL,
  payment_id        text REFERENCES payments(id) ON DELETE SET NULL,
  stage_changed_at  timestamptz NOT NULL DEFAULT now(),
  closed_at         timestamptz,
  -- first outgoing touch (call, message, note…) → response-time reports
  first_response_at timestamptz,
  last_activity_at  timestamptz,
  amo_id            bigint,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  UNIQUE (tenant_id, amo_id)
);
-- Kanban: one column = (pipeline, stage), newest activity first.
CREATE INDEX crm_leads_board_idx ON crm_leads (tenant_id, pipeline_id, stage_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX crm_leads_responsible_idx ON crm_leads (tenant_id, responsible_id) WHERE deleted_at IS NULL;
CREATE INDEX crm_leads_created_idx ON crm_leads (tenant_id, created_at);
CREATE INDEX crm_leads_contact_idx ON crm_leads (contact_id);

-- Timeline of everything that happened to a lead/contact. stage_change rows
-- carry {from, to} in meta and are the source of truth for funnel reports.
CREATE TABLE crm_activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  lead_id     uuid REFERENCES crm_leads(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('note', 'call', 'message', 'stage_change', 'task', 'sale', 'system')),
  direction   text CHECK (direction IN ('in', 'out')),
  channel     text,
  author_id   text,
  body        text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- e.g. 'note:123' / 'call:456' — idempotency key for the amo import
  amo_key     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, amo_key),
  CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL)
);
CREATE INDEX crm_activities_lead_idx ON crm_activities (lead_id, created_at DESC);
CREATE INDEX crm_activities_contact_idx ON crm_activities (contact_id, created_at DESC);
CREATE INDEX crm_activities_report_idx ON crm_activities (tenant_id, type, created_at);

CREATE TABLE crm_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  lead_id      uuid REFERENCES crm_leads(id) ON DELETE CASCADE,
  contact_id   uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  assignee_id  text REFERENCES employees(id) ON DELETE SET NULL,
  text         text NOT NULL,
  due_at       timestamptz NOT NULL,
  done_at      timestamptz,
  result       text,
  amo_id       bigint,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, amo_id)
);
CREATE INDEX crm_tasks_open_idx ON crm_tasks (tenant_id, assignee_id, due_at) WHERE done_at IS NULL;
CREATE INDEX crm_tasks_lead_idx ON crm_tasks (lead_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_pipelines', 'crm_stages', 'crm_contacts', 'crm_leads', 'crm_tasks'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t || '_updated_at', t);
  END LOOP;
  -- live kanban / task list / timeline
  FOREACH t IN ARRAY ARRAY['crm_leads', 'crm_tasks', 'crm_activities', 'crm_stages'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION notify_change()', t || '_notify', t);
  END LOOP;
END $$;
