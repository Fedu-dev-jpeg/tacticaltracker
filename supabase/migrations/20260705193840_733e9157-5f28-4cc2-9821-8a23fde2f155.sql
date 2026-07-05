
-- 1) has_role: switch to SECURITY INVOKER + restrict EXECUTE
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

-- 2) strategies: authenticated read, admin write
DROP POLICY IF EXISTS "Anyone can read strategies" ON public.strategies;
DROP POLICY IF EXISTS "Anyone can insert strategies" ON public.strategies;
DROP POLICY IF EXISTS "Anyone can update strategies" ON public.strategies;
DROP POLICY IF EXISTS "Anyone can delete strategies" ON public.strategies;
CREATE POLICY "Authenticated can read strategies" ON public.strategies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert strategies" ON public.strategies
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update strategies" ON public.strategies
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete strategies" ON public.strategies
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3) player_descriptions: authenticated read, admin write
DROP POLICY IF EXISTS "Anyone can read player_descriptions" ON public.player_descriptions;
DROP POLICY IF EXISTS "Anyone can insert player_descriptions" ON public.player_descriptions;
DROP POLICY IF EXISTS "Anyone can update player_descriptions" ON public.player_descriptions;
DROP POLICY IF EXISTS "Anyone can delete player_descriptions" ON public.player_descriptions;
CREATE POLICY "Authenticated can read player_descriptions" ON public.player_descriptions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert player_descriptions" ON public.player_descriptions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update player_descriptions" ON public.player_descriptions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete player_descriptions" ON public.player_descriptions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4) agenda_events: writes admin-only
DROP POLICY IF EXISTS "Authenticated users can insert agenda" ON public.agenda_events;
DROP POLICY IF EXISTS "Authenticated users can update agenda" ON public.agenda_events;
DROP POLICY IF EXISTS "Authenticated users can delete agenda" ON public.agenda_events;
CREATE POLICY "Admins can insert agenda" ON public.agenda_events
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update agenda" ON public.agenda_events
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete agenda" ON public.agenda_events
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5) matches: writes admin-only (edge function uses service_role, bypasses RLS)
DROP POLICY IF EXISTS "Authenticated users can insert matches" ON public.matches;
DROP POLICY IF EXISTS "Authenticated users can update matches" ON public.matches;
DROP POLICY IF EXISTS "Authenticated users can delete matches" ON public.matches;
CREATE POLICY "Admins can insert matches" ON public.matches
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update matches" ON public.matches
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete matches" ON public.matches
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6) team_objectives: writes admin-only
DROP POLICY IF EXISTS "Authenticated users can insert objectives" ON public.team_objectives;
DROP POLICY IF EXISTS "Authenticated users can update objectives" ON public.team_objectives;
DROP POLICY IF EXISTS "Authenticated users can delete objectives" ON public.team_objectives;
CREATE POLICY "Admins can insert objectives" ON public.team_objectives
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update objectives" ON public.team_objectives
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete objectives" ON public.team_objectives
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7) player_stats: restrict INSERT to admins (edge function uses service_role)
DROP POLICY IF EXISTS "Authenticated can insert player stats" ON public.player_stats;
CREATE POLICY "Admins can insert player stats" ON public.player_stats
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8) user_roles: explicit admin-only write policies (SELECT authenticated stays)
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 9) demos storage bucket: uploads admin-only
DROP POLICY IF EXISTS "Authenticated can upload demos" ON storage.objects;
CREATE POLICY "Admins can upload demos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'demos' AND public.has_role(auth.uid(), 'admin'));
