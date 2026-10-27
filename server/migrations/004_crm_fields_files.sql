-- CRM, part 2: the school's own fields on deals/contacts, files attached to
-- deals, and indexes for the list view filters.

-- Custom fields. Values live in crm_leads.custom->'fields' /
-- crm_contacts.custom->'fields' as { <key>: value }, so adding a field needs
-- no schema change; `key` never changes after creation (labels may).
CREATE TABLE crm_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  entity      text NOT NULL CHECK (entity IN ('lead', 'contact')),
  key         text NOT NULL,
  label       text NOT NULL,
  -- text | textarea | number | date | select | multiselect | checkbox | url
  type        text NOT NULL,
  options     text[] NOT NULL DEFAULT '{}',
  sort        integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity, key)
);
CREATE TRIGGER crm_fields_updated_at BEFORE UPDATE ON crm_fields FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Files attached to a deal (contracts, passport scans, screenshots…). The
-- bytes are on disk (FILES_DIR, a Docker volume), named by id.
CREATE TABLE crm_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  lead_id      uuid REFERENCES crm_leads(id) ON DELETE CASCADE,
  contact_id   uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  name         text NOT NULL,
  mime         text,
  size         bigint NOT NULL,
  uploaded_by  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL)
);
CREATE INDEX crm_files_lead_idx ON crm_files (lead_id, created_at DESC);
CREATE TRIGGER crm_files_notify AFTER INSERT OR UPDATE OR DELETE ON crm_files FOR EACH ROW EXECUTE FUNCTION notify_change();

-- List view filters
CREATE INDEX crm_leads_tags_idx ON crm_leads USING gin (tags) WHERE deleted_at IS NULL;
CREATE INDEX crm_leads_closed_idx ON crm_leads (tenant_id, closed_at) WHERE deleted_at IS NULL;
CREATE INDEX crm_tasks_lead_open_idx ON crm_tasks (lead_id, due_at) WHERE done_at IS NULL;
