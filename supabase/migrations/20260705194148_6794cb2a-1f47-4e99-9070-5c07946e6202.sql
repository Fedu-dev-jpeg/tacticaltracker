
-- Audit log table
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  user_id uuid,
  user_email text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_data jsonb,
  new_data jsonb
);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
ON public.audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX audit_log_changed_at_idx ON public.audit_log (changed_at DESC);
CREATE INDEX audit_log_table_name_idx ON public.audit_log (table_name);

-- Generic trigger function
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_record_id text;
BEGIN
  v_user_id := auth.uid();
  BEGIN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_user_email := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_record_id := (to_jsonb(OLD)->>'id');
    INSERT INTO public.audit_log(table_name, record_id, action, user_id, user_email, old_data)
    VALUES (TG_TABLE_NAME, v_record_id, 'DELETE', v_user_id, v_user_email, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := (to_jsonb(NEW)->>'id');
    INSERT INTO public.audit_log(table_name, record_id, action, user_id, user_email, old_data, new_data)
    VALUES (TG_TABLE_NAME, v_record_id, 'UPDATE', v_user_id, v_user_email, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := (to_jsonb(NEW)->>'id');
    INSERT INTO public.audit_log(table_name, record_id, action, user_id, user_email, new_data)
    VALUES (TG_TABLE_NAME, v_record_id, 'INSERT', v_user_id, v_user_email, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach triggers to matches, team_objectives, agenda_events
CREATE TRIGGER audit_matches
AFTER INSERT OR UPDATE OR DELETE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_team_objectives
AFTER INSERT OR UPDATE OR DELETE ON public.team_objectives
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_agenda_events
AFTER INSERT OR UPDATE OR DELETE ON public.agenda_events
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
