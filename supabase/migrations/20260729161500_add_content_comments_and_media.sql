-- Comments on content items (used for YouTube videos and general discussion)
CREATE TABLE IF NOT EXISTS public.content_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_comments_content_item_idx
  ON public.content_comments (content_item_id, created_at ASC);
CREATE INDEX IF NOT EXISTS content_comments_user_idx
  ON public.content_comments (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_comments TO authenticated;
GRANT ALL ON public.content_comments TO service_role;

ALTER TABLE public.content_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read content comments" ON public.content_comments;
CREATE POLICY "Authenticated can read content comments"
ON public.content_comments
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert own content comments" ON public.content_comments;
CREATE POLICY "Users can insert own content comments"
ON public.content_comments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own content comments" ON public.content_comments;
CREATE POLICY "Users can update own content comments"
ON public.content_comments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users and staff can delete content comments" ON public.content_comments;
CREATE POLICY "Users and staff can delete content comments"
ON public.content_comments
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'coach')
);

DROP TRIGGER IF EXISTS update_content_comments_updated_at ON public.content_comments;
CREATE TRIGGER update_content_comments_updated_at
BEFORE UPDATE ON public.content_comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
