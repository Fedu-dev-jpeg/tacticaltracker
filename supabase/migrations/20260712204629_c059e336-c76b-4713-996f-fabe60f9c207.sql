
DROP POLICY IF EXISTS "Authenticated can read roles" ON public.user_roles;

CREATE POLICY "Users read own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
