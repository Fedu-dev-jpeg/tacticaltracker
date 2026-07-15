-- Restore previous behavior: every registered match/treino must be visible in
-- Dashboard, Historial, Stats and Mapas, regardless of whether it came from
-- manual registration, cs2.cam, or demo parsing.
UPDATE public.matches
SET confirmed = true
WHERE confirmed = false;
