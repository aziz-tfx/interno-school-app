-- ERP core: every Firestore collection becomes a "document table".
--
--   id         — the Firestore document id, kept as-is so cross-references
--                (studentId, groupId, teacherId, …) keep working after import
--   tenant_id  — school; every query is scoped by it (enforced in the API)
--   data       — the full document, same shape the frontend uses today
--
-- Fields that need filtering/sorting/joins are exposed as STORED generated
-- columns over `data`, so writes only ever touch `data` and the columns can
-- never drift. Over time hot fields can be promoted to real columns.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Cast that returns NULL instead of failing: legacy documents hold amounts
-- like "1 200 000" or "" and must not block the import.
CREATE FUNCTION safe_numeric(v text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN replace(v, ' ', '')::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Realtime: every change is announced on channel 'changes'; the API relays
-- it to subscribed browsers over SSE (src/realtime.js). Only ids travel —
-- NOTIFY payloads are capped at 8 KB.
CREATE FUNCTION notify_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  PERFORM pg_notify('changes', json_build_object(
    'table', TG_TABLE_NAME, 'tenant', r.tenant_id, 'id', r.id, 'op', lower(TG_OP)
  )::text);
  RETURN NULL;
END $$;

CREATE FUNCTION create_doc_table(t text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format($f$
    CREATE TABLE %1$I (
      id         text PRIMARY KEY,
      tenant_id  text NOT NULL,
      data       jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX %2$I ON %1$I (tenant_id);
    CREATE TRIGGER %3$I BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER %4$I AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION notify_change();
  $f$, t, t || '_tenant_idx', t || '_updated_at', t || '_notify');
END $$;

SELECT create_doc_table(t) FROM unnest(ARRAY[
  'tenants', 'tenant_integrations', 'settings',
  'employees', 'branches', 'rooms', 'courses', 'groups', 'teachers', 'students',
  'payments', 'payme_transactions', 'schedule', 'attendance',
  'sales_plans', 'amo_plans', 'report_plans', 'report_daily',
  'contract_templates', 'automation_settings', 'audit_log', 'messages', 'leads',
  'lms_lessons', 'lms_assignments', 'lms_submissions', 'lms_announcements',
  'lms_modules', 'lms_progress', 'lms_video_progress', 'student_game_data',
  'ai_agent_conversations', 'ai_agent_alerts'
]) AS t;

-- ─── Employees (also the login table — students log in through it too) ──
-- password_hash lives OUTSIDE `data` so no API path can ever return it.
-- token_version is embedded in the JWT; bumping it revokes all sessions.
ALTER TABLE employees
  ADD COLUMN password_hash text,
  ADD COLUMN token_version integer NOT NULL DEFAULT 0,
  ADD COLUMN login text GENERATED ALWAYS AS (lower(btrim(data->>'login'))) STORED,
  ADD COLUMN login_tail text GENERATED ALWAYS AS (
    regexp_replace(regexp_replace(coalesce(data->>'login', ''), '\D', '', 'g'), '^998', '')
  ) STORED,
  ADD COLUMN role text GENERATED ALWAYS AS (data->>'role') STORED,
  ADD COLUMN status text GENERATED ALWAYS AS (data->>'status') STORED,
  ADD COLUMN amo_user_id bigint GENERATED ALWAYS AS (safe_numeric(data->>'amoUserId')::bigint) STORED;
CREATE INDEX employees_login_idx ON employees (login);
CREATE INDEX employees_login_tail_idx ON employees (login_tail);
CREATE INDEX employees_tenant_role_idx ON employees (tenant_id, role);

-- ─── Students ────────────────────────────────────────────────────────────
ALTER TABLE students
  ADD COLUMN phone_digits text GENERATED ALWAYS AS (
    regexp_replace(coalesce(data->>'phone', ''), '\D', '', 'g')
  ) STORED,
  ADD COLUMN branch text GENERATED ALWAYS AS (data->>'branch') STORED,
  ADD COLUMN status text GENERATED ALWAYS AS (data->>'status') STORED;
CREATE INDEX students_tenant_branch_idx ON students (tenant_id, branch);
CREATE INDEX students_phone_idx ON students (phone_digits);
CREATE INDEX students_name_trgm_idx ON students USING gin ((data->>'name') gin_trgm_ops);

-- ─── Payments ────────────────────────────────────────────────────────────
-- `date` stays ISO text ('YYYY-MM-DD'): it sorts correctly and a text→date
-- cast is not immutable, so it can't back a generated column.
ALTER TABLE payments
  ADD COLUMN student_id text GENERATED ALWAYS AS (data->>'studentId') STORED,
  ADD COLUMN type text GENERATED ALWAYS AS (data->>'type') STORED,
  ADD COLUMN amount numeric GENERATED ALWAYS AS (safe_numeric(data->>'amount')) STORED,
  ADD COLUMN pay_date text GENERATED ALWAYS AS (data->>'date') STORED,
  ADD COLUMN branch text GENERATED ALWAYS AS (data->>'branch') STORED,
  ADD COLUMN method text GENERATED ALWAYS AS (data->>'method') STORED,
  ADD COLUMN manager_id text GENERATED ALWAYS AS (data->>'managerId') STORED;
CREATE INDEX payments_tenant_date_idx ON payments (tenant_id, pay_date);
CREATE INDEX payments_student_idx ON payments (student_id);

-- ─── Groups, schedule, LMS: the usual join keys ──────────────────────────
ALTER TABLE groups
  ADD COLUMN branch text GENERATED ALWAYS AS (data->>'branch') STORED,
  ADD COLUMN teacher_id text GENERATED ALWAYS AS (data->>'teacherId') STORED;
CREATE INDEX groups_tenant_branch_idx ON groups (tenant_id, branch);

ALTER TABLE lms_progress ADD COLUMN student_id text GENERATED ALWAYS AS (data->>'studentId') STORED;
CREATE INDEX lms_progress_student_idx ON lms_progress (student_id);
ALTER TABLE lms_submissions ADD COLUMN student_id text GENERATED ALWAYS AS (data->>'studentId') STORED;
CREATE INDEX lms_submissions_student_idx ON lms_submissions (student_id);
ALTER TABLE messages ADD COLUMN student_id text GENERATED ALWAYS AS (data->>'studentId') STORED;
CREATE INDEX messages_student_idx ON messages (student_id);

CREATE INDEX audit_log_tenant_time_idx ON audit_log (tenant_id, created_at DESC);
