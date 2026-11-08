-- Telegram Mini App sign-in. The Telegram account a person linked from inside
-- the mini app (verified initData). Kept OUTSIDE `data` on purpose: the
-- generic collections API writes `data`, and whoever can edit an employee
-- card must not be able to point someone else's account at their own Telegram.
ALTER TABLE employees ADD COLUMN telegram_user_id bigint;
CREATE UNIQUE INDEX employees_telegram_user_idx ON employees (tenant_id, telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;
