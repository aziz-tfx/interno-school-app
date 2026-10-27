-- Daily jobs (automations): one row per job, last_date = the Tashkent date
-- it last ran. Claiming a run is an UPDATE of this row, so a job runs once a
-- day even across restarts or several API processes.
CREATE TABLE scheduled_runs (
  name      text PRIMARY KEY,
  last_date text NOT NULL,
  ran_at    timestamptz NOT NULL DEFAULT now()
);
