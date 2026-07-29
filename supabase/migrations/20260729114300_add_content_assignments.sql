ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS assigned_user_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requires_response BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_file BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS routine_group TEXT,
  ADD COLUMN IF NOT EXISTS source_format TEXT NOT NULL DEFAULT 'link';

CREATE TABLE IF NOT EXISTS public.content_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL DEFAULT '',
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachment_url TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, user_id)
);

CREATE INDEX IF NOT EXISTS content_items_assigned_user_ids_idx ON public.content_items USING gin (assigned_user_ids);
CREATE INDEX IF NOT EXISTS content_responses_content_item_idx ON public.content_responses (content_item_id);
CREATE INDEX IF NOT EXISTS content_responses_user_idx ON public.content_responses (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_responses TO authenticated;
GRANT ALL ON public.content_responses TO service_role;

ALTER TABLE public.content_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users and staff can read content responses"
ON public.content_responses
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'coach')
);

CREATE POLICY "Users can insert own content responses"
ON public.content_responses
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'coach')
);

CREATE POLICY "Users can update own content responses"
ON public.content_responses
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'coach')
)
WITH CHECK (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'coach')
);

CREATE POLICY "Staff can delete content responses"
ON public.content_responses
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

DROP TRIGGER IF EXISTS update_content_responses_updated_at ON public.content_responses;
CREATE TRIGGER update_content_responses_updated_at
BEFORE UPDATE ON public.content_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
