-- Ensure PostgREST/Supabase REST sees the newly-created content tables
-- immediately after the content migrations run.
NOTIFY pgrst, 'reload schema';
