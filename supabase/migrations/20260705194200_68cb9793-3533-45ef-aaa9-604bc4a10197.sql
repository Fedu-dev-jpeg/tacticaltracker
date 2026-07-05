
REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM authenticated;
