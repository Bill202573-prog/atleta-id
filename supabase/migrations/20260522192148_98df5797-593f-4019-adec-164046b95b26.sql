
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
    body := jsonb_build_object('source','cron')
  );
  $$
);
