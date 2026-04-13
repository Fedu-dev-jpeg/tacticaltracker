
CREATE TABLE public.agenda_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  time_start TEXT NOT NULL DEFAULT '15:00',
  time_end TEXT NOT NULL DEFAULT '16:00',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'training',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read agenda" ON public.agenda_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert agenda" ON public.agenda_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update agenda" ON public.agenda_events FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete agenda" ON public.agenda_events FOR DELETE TO authenticated USING (true);
