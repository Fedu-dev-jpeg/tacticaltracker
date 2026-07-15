-- Lock down log_audit_event: it's only meant to be fired by triggers, never called directly.
REVOKE ALL ON FUNCTION public.log_audit_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_audit_event() FROM anon;
REVOKE ALL ON FUNCTION public.log_audit_event() FROM authenticated;

-- current_user_role: switch to SECURITY INVOKER. user_roles RLS already lets each user read their own row.
CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'coach' THEN 1 ELSE 2 END
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;