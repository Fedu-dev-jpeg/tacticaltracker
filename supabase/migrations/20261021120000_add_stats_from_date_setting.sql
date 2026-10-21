-- Persistent "stats era" start date used by Dashboard / Stats / Mapas.
INSERT INTO public.team_settings (key, value)
VALUES ('stats_from_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'))
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
