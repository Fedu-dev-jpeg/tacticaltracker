UPDATE public.content_items
SET routine_group = 'general'
WHERE category = 'routine'
  AND routine_group = 'peos';
