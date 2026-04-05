
-- Create matches table
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  map TEXT NOT NULL,
  rival TEXT NOT NULL DEFAULT '',
  score_us INTEGER NOT NULL DEFAULT 0,
  score_them INTEGER NOT NULL DEFAULT 0,
  ct_pistol TEXT NOT NULL DEFAULT 'WIN',
  ct_second_round TEXT NOT NULL DEFAULT 'WIN',
  tr_pistol TEXT NOT NULL DEFAULT 'WIN',
  tr_second_round TEXT NOT NULL DEFAULT 'WIN',
  starting_side TEXT NOT NULL DEFAULT 'CT',
  notes TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read matches" ON public.matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert matches" ON public.matches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update matches" ON public.matches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete matches" ON public.matches FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create team_objectives table
CREATE TABLE public.team_objectives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  target_value INTEGER NOT NULL DEFAULT 1,
  current_value INTEGER NOT NULL DEFAULT 0,
  week_start DATE NOT NULL DEFAULT (date_trunc('week', now()))::date,
  created_by TEXT NOT NULL DEFAULT '',
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.team_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read objectives" ON public.team_objectives FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert objectives" ON public.team_objectives FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update objectives" ON public.team_objectives FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete objectives" ON public.team_objectives FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_objectives_updated_at BEFORE UPDATE ON public.team_objectives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
