-- Student side of the LMS: lesson feedback, portfolios and Telegram study notices.

-- «Понятно / сложно» after a lesson. One document per student and lesson
-- (id = <studentId>_<lessonId>), written by the student from the lesson page.
SELECT create_doc_table('lms_lesson_feedback');
CREATE INDEX lms_lesson_feedback_lesson_idx ON lms_lesson_feedback ((data->>'lessonId'));

-- A student's portfolio: which checked works they show and the link token
-- of the public page. One document per student (id = student id).
SELECT create_doc_table('portfolios');
CREATE UNIQUE INDEX portfolios_token_idx ON portfolios ((data->>'token')) WHERE data->>'token' IS NOT NULL;

-- What has already been sent to a student in Telegram about their studies
-- (a grade, a teacher's message, tomorrow's deadline…). The row is the
-- claim: whoever inserts it sends the message, so a notice goes out once
-- whatever the restarts and however often the sweep runs.
CREATE TABLE student_notices (
  tenant_id   text NOT NULL,
  student_id  text NOT NULL,
  key         text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, student_id, key)
);
CREATE INDEX student_notices_sent_idx ON student_notices (sent_at);
