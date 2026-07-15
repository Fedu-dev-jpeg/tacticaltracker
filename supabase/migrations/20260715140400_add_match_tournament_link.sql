ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS matches_tournament_id_idx ON public.matches (tournament_id);
