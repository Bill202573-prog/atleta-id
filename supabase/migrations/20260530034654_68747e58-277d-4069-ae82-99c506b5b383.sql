-- Recriar crons de push com timeout_milliseconds = 60000 (60s)
-- O default do pg_net é 5000ms, o que estava matando os workers no meio da execução.

SELECT cron.unschedule('process-push-reminders-daily');
SELECT cron.schedule(
  'process-push-reminders-daily',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vxzktyklzkfqitptzctk.supabase.co/functions/v1/process-push-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4emt0eWtsemtmcWl0cHR6Y3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MzE0MTcsImV4cCI6MjA4ODUwNzQxN30.XUgZRd_p8y-80zMYEjIsG5CiEYf8f-pmWCRkp64lElo"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);

SELECT cron.unschedule('process-admin-pendencias-push');
SELECT cron.schedule(
  'process-admin-pendencias-push',
  '0 15 */2 * *',
  $$
  SELECT net.http_post(
    url := 'https://vxzktyklzkfqitptzctk.supabase.co/functions/v1/process-admin-pendencias-push',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4emt0eWtsemtmcWl0cHR6Y3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MzE0MTcsImV4cCI6MjA4ODUwNzQxN30.XUgZRd_p8y-80zMYEjIsG5CiEYf8f-pmWCRkp64lElo"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);

SELECT cron.unschedule('resumo-mensal-push-dia-1');
SELECT cron.schedule(
  'resumo-mensal-push-dia-1',
  '0 12 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://vxzktyklzkfqitptzctk.supabase.co/functions/v1/resumo-mensal-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4emt0eWtsemtmcWl0cHR6Y3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MzE0MTcsImV4cCI6MjA4ODUwNzQxN30.XUgZRd_p8y-80zMYEjIsG5CiEYf8f-pmWCRkp64lElo'
    ),
    body := jsonb_build_object('source','cron'),
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);