
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false;

-- Todo lo existente pasa a "confirmado" para no ocultarlo del historial.
UPDATE public.matches SET confirmed = true WHERE confirmed = false;

CREATE INDEX IF NOT EXISTS matches_confirmed_idx ON public.matches (confirmed);

ALTER TABLE public.player_stats
  ADD COLUMN IF NOT EXISTS role TEXT;
