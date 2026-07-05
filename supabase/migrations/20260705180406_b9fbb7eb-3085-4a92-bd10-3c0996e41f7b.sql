CREATE POLICY "Authenticated can upload demos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'demos');

CREATE POLICY "Admins can read demos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'demos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete demos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'demos' AND public.has_role(auth.uid(), 'admin'));