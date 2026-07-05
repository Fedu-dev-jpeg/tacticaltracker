-- 1) Roles enum & user_roles table
CREATE TYPE public.app_role AS ENUM ('player', 'coach', 'admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

-- Security-definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 2) team_members table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  player_name TEXT NOT NULL,
  steam_id TEXT,
  steam_tag TEXT,
  role_in_team TEXT,
  is_coach BOOLEAN NOT NULL DEFAULT false,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.team_members TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view team"
  ON public.team_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can insert team members"
  ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update team members"
  ON public.team_members FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete team members"
  ON public.team_members FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) player_stats table (linked to matches + optional user)
CREATE TABLE public.player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  steam_id TEXT,
  steam_tag TEXT,
  kills INT DEFAULT 0,
  deaths INT DEFAULT 0,
  assists INT DEFAULT 0,
  adr NUMERIC,
  hs_pct NUMERIC,
  kast_pct NUMERIC,
  kr NUMERIC,
  dr NUMERIC,
  fk INT DEFAULT 0,
  fd INT DEFAULT 0,
  flash_assists INT DEFAULT 0,
  util_dmg INT DEFAULT 0,
  k2 INT DEFAULT 0,
  k3 INT DEFAULT 0,
  k4 INT DEFAULT 0,
  k5 INT DEFAULT 0,
  rating NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_player_stats_match ON public.player_stats(match_id);
CREATE INDEX idx_player_stats_user ON public.player_stats(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_stats TO authenticated;
GRANT ALL ON public.player_stats TO service_role;

ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view player stats"
  ON public.player_stats FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert player stats"
  ON public.player_stats FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can update player stats"
  ON public.player_stats FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete player stats"
  ON public.player_stats FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_player_stats_updated_at
  BEFORE UPDATE ON public.player_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) tournaments + tournament_maps
CREATE TABLE public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  format TEXT NOT NULL DEFAULT 'BO1',
  status TEXT NOT NULL DEFAULT 'upcoming',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view tournaments"
  ON public.tournaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage tournaments insert"
  ON public.tournaments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage tournaments update"
  ON public.tournaments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage tournaments delete"
  ON public.tournaments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tournament_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  map_name TEXT NOT NULL,
  result TEXT,
  score_us INT,
  score_them INT,
  played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_maps TO authenticated;
GRANT ALL ON public.tournament_maps TO service_role;

ALTER TABLE public.tournament_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view tournament maps"
  ON public.tournament_maps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage tournament maps"
  ON public.tournament_maps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));