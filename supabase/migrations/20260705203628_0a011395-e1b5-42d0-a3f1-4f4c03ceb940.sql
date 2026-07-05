DROP INDEX IF EXISTS public.agenda_events_teamup_event_id_key;
ALTER TABLE public.agenda_events ADD CONSTRAINT agenda_events_teamup_event_id_key UNIQUE (teamup_event_id);