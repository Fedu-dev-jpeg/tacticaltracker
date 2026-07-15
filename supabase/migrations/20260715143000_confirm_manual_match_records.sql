-- Manual records created from Registrar do not have demo_data and should be
-- visible immediately in Dashboard/Historial/Stats. Demo uploads stay pending
-- until they are reviewed because they carry demo_data/player_stats.
UPDATE public.matches
SET confirmed = true
WHERE confirmed = false
  AND demo_data IS NULL;
