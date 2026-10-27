// CRM reports in plain SQL — what api/amo/performance-v2.js and
// response-times.js approximate from amo's event stream today.
//
// Cohort = leads created in [from, to] (Tashkent dates). "Reached" a stage
// means the lead entered that stage or any later one (by sort), so a lead
// that jumped from «Новая заявка» straight to «Успешно» still counts as
// having passed the stages in between — the usual funnel convention.
//
// Response time only means something for leads that came in by themselves
// (landing, channels, amo import — created_by IS NULL). A deal a manager
// typed in after talking to the client would read as "answered in 0 min".

const TZ = 'Asia/Tashkent'

export async function funnelReport(db, tenantId, { pipelineId, from, to }) {
  const params = [tenantId, pipelineId, from, to]
  const cohort = `
    SELECT l.* FROM crm_leads l
     WHERE l.tenant_id = $1 AND l.pipeline_id = $2 AND l.deleted_at IS NULL
       AND l.created_at >= ($3::date)::timestamp AT TIME ZONE '${TZ}'
       AND l.created_at <  ($4::date + 1)::timestamp AT TIME ZONE '${TZ}'`

  const { rows: stages } = await db.query(`
    WITH cohort AS (${cohort}),
    reached AS (
      -- furthest non-lost stage each lead has ever been in
      SELECT c.id AS lead_id, max(s.sort) AS max_sort
        FROM cohort c
        JOIN crm_activities a ON a.lead_id = c.id AND a.type = 'stage_change'
        JOIN crm_stages s ON s.id = (a.meta->>'to')::uuid AND s.kind <> 'lost' AND s.pipeline_id = $2
       GROUP BY c.id
    )
    SELECT s.id, s.name, s.color, s.kind, s.sort,
           CASE WHEN s.kind = 'lost'
                THEN (SELECT count(*) FROM cohort c WHERE c.stage_id = s.id)
                ELSE (SELECT count(*) FROM reached r WHERE r.max_sort >= s.sort) END::int AS reached,
           (SELECT count(*) FROM cohort c WHERE c.stage_id = s.id)::int AS now_in_stage
      FROM crm_stages s
     WHERE s.pipeline_id = $2 AND s.tenant_id = $1
     ORDER BY s.sort`, params)

  const { rows: [totals] } = await db.query(`
    WITH cohort AS (${cohort})
    SELECT count(*)::int AS created,
           count(*) FILTER (WHERE s.kind = 'won')::int AS won,
           count(*) FILTER (WHERE s.kind = 'lost')::int AS lost,
           coalesce(sum(c.amount) FILTER (WHERE s.kind = 'won'), 0) AS won_amount,
           round((avg(extract(epoch FROM c.first_response_at - c.created_at) / 60)
             FILTER (WHERE c.created_by IS NULL))::numeric, 1) AS avg_response_min,
           round((percentile_cont(0.5) WITHIN GROUP (
             ORDER BY extract(epoch FROM c.first_response_at - c.created_at) / 60)
             FILTER (WHERE c.created_by IS NULL))::numeric, 1) AS median_response_min,
           count(*) FILTER (WHERE c.created_by IS NULL AND c.first_response_at IS NULL AND s.kind = 'open')::int AS no_response
      FROM cohort c JOIN crm_stages s ON s.id = c.stage_id`, params)

  const { rows: byResponsible } = await db.query(`
    WITH cohort AS (${cohort})
    SELECT c.responsible_id,
           e.data->>'name' AS name,
           count(*)::int AS created,
           count(*) FILTER (WHERE s.kind = 'won')::int AS won,
           coalesce(sum(c.amount) FILTER (WHERE s.kind = 'won'), 0) AS won_amount,
           round((percentile_cont(0.5) WITHIN GROUP (
             ORDER BY extract(epoch FROM c.first_response_at - c.created_at) / 60)
             FILTER (WHERE c.created_by IS NULL))::numeric, 1) AS median_response_min
      FROM cohort c
      JOIN crm_stages s ON s.id = c.stage_id
      LEFT JOIN employees e ON e.id = c.responsible_id
     GROUP BY c.responsible_id, e.data->>'name'
     ORDER BY won_amount DESC, created DESC`, params)

  const conv = (n) => (totals.created ? Math.round((n / totals.created) * 1000) / 10 : 0)
  return {
    period: { from, to },
    totals: { ...camel(totals), conversion: conv(totals.won) },
    stages: stages.map(s => ({ ...camel(s), conversion: conv(s.reached) })),
    byResponsible: byResponsible.map(camel),
  }
}

function camel(row) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]))
}

/**
 * The rest of the sales reports for a period (Tashkent dates):
 *   now       — open deals, overdue tasks, inbound leads nobody answered, new today
 *   daily     — new leads, sales and losses per day
 *   sources   — leads, sales, conversion and revenue per source (cohort = created in period)
 *   lossReasons — deals lost in the period, by reason
 *   activity  — per employee: calls (in/out, talk time), notes, tasks done, stage moves, sales
 */
export async function insightsReport(db, tenantId, { pipelineId, from, to }) {
  const params = [tenantId, pipelineId, from, to]
  const inRange = (col) => `${col} >= ($3::date)::timestamp AT TIME ZONE '${TZ}' AND ${col} < ($4::date + 1)::timestamp AT TIME ZONE '${TZ}'`

  const [now, daily, sources, lossReasons, activity] = await Promise.all([
    db.query(`
      SELECT
        (SELECT count(*) FROM crm_leads l JOIN crm_stages s ON s.id = l.stage_id
          WHERE l.tenant_id = $1 AND l.pipeline_id = $2 AND l.deleted_at IS NULL AND s.kind = 'open')::int AS open_leads,
        (SELECT coalesce(sum(l.amount), 0) FROM crm_leads l JOIN crm_stages s ON s.id = l.stage_id
          WHERE l.tenant_id = $1 AND l.pipeline_id = $2 AND l.deleted_at IS NULL AND s.kind = 'open') AS open_amount,
        (SELECT count(*) FROM crm_tasks t WHERE t.tenant_id = $1 AND t.done_at IS NULL AND t.due_at < now())::int AS overdue_tasks,
        (SELECT count(*) FROM crm_leads l JOIN crm_stages s ON s.id = l.stage_id
          WHERE l.tenant_id = $1 AND l.pipeline_id = $2 AND l.deleted_at IS NULL AND s.kind = 'open'
            AND l.created_by IS NULL AND l.first_response_at IS NULL)::int AS unanswered,
        (SELECT count(*) FROM crm_leads l
          WHERE l.tenant_id = $1 AND l.pipeline_id = $2 AND l.deleted_at IS NULL
            AND l.created_at >= (now() AT TIME ZONE '${TZ}')::date::timestamp AT TIME ZONE '${TZ}')::int AS new_today`,
      [tenantId, pipelineId]),
    db.query(`
      WITH days AS (SELECT g::date AS d FROM generate_series($3::date, $4::date, interval '1 day') g),
      created AS (
        SELECT (l.created_at AT TIME ZONE '${TZ}')::date AS d, count(*)::int AS n
          FROM crm_leads l
         WHERE l.tenant_id = $1 AND l.pipeline_id = $2 AND l.deleted_at IS NULL AND ${inRange('l.created_at')}
         GROUP BY 1),
      closed AS (
        SELECT (l.closed_at AT TIME ZONE '${TZ}')::date AS d,
               count(*) FILTER (WHERE s.kind = 'won')::int AS won,
               count(*) FILTER (WHERE s.kind = 'lost')::int AS lost
          FROM crm_leads l JOIN crm_stages s ON s.id = l.stage_id
         WHERE l.tenant_id = $1 AND l.pipeline_id = $2 AND l.deleted_at IS NULL AND ${inRange('l.closed_at')}
         GROUP BY 1)
      SELECT to_char(days.d, 'YYYY-MM-DD') AS date, coalesce(created.n, 0) AS created,
             coalesce(closed.won, 0) AS won, coalesce(closed.lost, 0) AS lost
        FROM days LEFT JOIN created USING (d) LEFT JOIN closed USING (d)
       ORDER BY days.d`, params),
    db.query(`
      SELECT coalesce(l.source, '') AS source, count(*)::int AS created,
             count(*) FILTER (WHERE s.kind = 'won')::int AS won,
             count(*) FILTER (WHERE s.kind = 'lost')::int AS lost,
             coalesce(sum(l.amount) FILTER (WHERE s.kind = 'won'), 0) AS won_amount
        FROM crm_leads l JOIN crm_stages s ON s.id = l.stage_id
       WHERE l.tenant_id = $1 AND l.pipeline_id = $2 AND l.deleted_at IS NULL AND ${inRange('l.created_at')}
       GROUP BY 1 ORDER BY created DESC`, params),
    db.query(`
      SELECT coalesce(nullif(btrim(l.loss_reason), ''), 'Без причины') AS reason, count(*)::int AS count
        FROM crm_leads l JOIN crm_stages s ON s.id = l.stage_id
       WHERE l.tenant_id = $1 AND l.pipeline_id = $2 AND l.deleted_at IS NULL AND s.kind = 'lost' AND ${inRange('l.closed_at')}
       GROUP BY 1 ORDER BY count DESC LIMIT 20`, params),
    db.query(`
      SELECT a.author_id AS employee_id, e.data->>'name' AS name,
             count(*) FILTER (WHERE a.type = 'call' AND a.direction = 'out')::int AS calls_out,
             count(*) FILTER (WHERE a.type = 'call' AND a.direction = 'in')::int AS calls_in,
             coalesce(sum(safe_numeric(a.meta->>'duration')) FILTER (WHERE a.type = 'call'), 0)::int AS talk_sec,
             count(*) FILTER (WHERE a.type = 'note')::int AS notes,
             count(*) FILTER (WHERE a.type = 'task')::int AS tasks_done,
             count(*) FILTER (WHERE a.type = 'stage_change' AND a.meta->>'from' IS NOT NULL)::int AS stage_moves,
             count(*) FILTER (WHERE a.type = 'stage_change' AND st.kind = 'won')::int AS wins
        FROM crm_activities a
        LEFT JOIN employees e ON e.id = a.author_id
        LEFT JOIN crm_stages st ON a.type = 'stage_change' AND st.id = (a.meta->>'to')::uuid
       WHERE a.tenant_id = $1 AND a.author_id IS NOT NULL AND ${inRange('a.created_at')}
         -- this pipeline's deals (contact-only rows, e.g. a merge, count everywhere)
         AND (a.lead_id IS NULL OR EXISTS (SELECT 1 FROM crm_leads l WHERE l.id = a.lead_id AND l.pipeline_id = $2))
       GROUP BY a.author_id, e.data->>'name'
       ORDER BY wins DESC, calls_out DESC`, [tenantId, pipelineId, from, to]),
  ])

  // overdue tasks per person, next to their activity
  const { rows: overdue } = await db.query(
    `SELECT assignee_id, count(*)::int AS n FROM crm_tasks
      WHERE tenant_id = $1 AND done_at IS NULL AND due_at < now() AND assignee_id IS NOT NULL GROUP BY assignee_id`, [tenantId]
  )
  const overdueBy = Object.fromEntries(overdue.map(r => [r.assignee_id, r.n]))
  const conv = (won, created) => (created ? Math.round((won / created) * 1000) / 10 : 0)

  return {
    period: { from, to },
    now: camel(now.rows[0]),
    daily: daily.rows,
    sources: sources.rows.map(r => ({ ...camel(r), conversion: conv(r.won, r.created) })),
    lossReasons: lossReasons.rows,
    activity: activity.rows.map(r => ({ ...camel(r), overdueTasks: overdueBy[r.employee_id] || 0 })),
  }
}
