-- 1) attendance_records
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  arrival_time time NULL,
  late_level integer NOT NULL DEFAULT 0,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_member_id, attendance_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches y admins ven presencialidad"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'));

CREATE POLICY "Coaches y admins insertan presencialidad"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'));

CREATE POLICY "Coaches y admins editan presencialidad"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'));

CREATE POLICY "Coaches y admins borran presencialidad"
  ON public.attendance_records FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'));

CREATE TRIGGER attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) matches.tournament_id
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS tournament_id uuid NULL REFERENCES public.tournaments(id) ON DELETE SET NULL;

-- 3) current_user_role() helper
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'coach' THEN 1 ELSE 2 END
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;