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
