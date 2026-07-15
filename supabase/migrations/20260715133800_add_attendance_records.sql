CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  arrival_time TIME,
  late_level INT NOT NULL DEFAULT 0 CHECK (late_level BETWEEN 0 AND 3),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_member_id, attendance_date)
);

CREATE INDEX attendance_records_date_idx ON public.attendance_records (attendance_date DESC);
CREATE INDEX attendance_records_member_idx ON public.attendance_records (team_member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches and admins can read attendance"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'coach')
  );

CREATE POLICY "Coaches and admins can insert attendance"
  ON public.attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'coach')
  );

CREATE POLICY "Coaches and admins can update attendance"
  ON public.attendance_records FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'coach')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'coach')
  );

CREATE POLICY "Coaches and admins can delete attendance"
  ON public.attendance_records FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'coach')
  );

CREATE TRIGGER update_attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
