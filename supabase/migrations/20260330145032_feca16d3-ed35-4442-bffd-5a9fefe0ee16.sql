
-- Strategies table (public, no auth required for this team app)
CREATE TABLE public.strategies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  map TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('CT', 'TR')),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  player_roles JSONB NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Ready', 'Probado')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Player descriptions table
CREATE TABLE public.player_descriptions (
  player TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT ''
);

-- Enable RLS
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_descriptions ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (team app, no auth)
CREATE POLICY "Anyone can read strategies" ON public.strategies FOR SELECT USING (true);
CREATE POLICY "Anyone can insert strategies" ON public.strategies FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update strategies" ON public.strategies FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete strategies" ON public.strategies FOR DELETE USING (true);

CREATE POLICY "Anyone can read player_descriptions" ON public.player_descriptions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert player_descriptions" ON public.player_descriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update player_descriptions" ON public.player_descriptions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete player_descriptions" ON public.player_descriptions FOR DELETE USING (true);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_strategies_updated_at
  BEFORE UPDATE ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default player descriptions
INSERT INTO public.player_descriptions (player, description) VALUES
  ('Froud', 'Lurker · DTT y ST'),
  ('Fedu', 'Soporte · IGL'),
  ('Hanzo', 'AWPer principal'),
  ('Diuva', 'Star Player'),
  ('Gyer', 'Ancla');
