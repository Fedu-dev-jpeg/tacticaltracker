-- Editable playbook codewords / callouts
CREATE TABLE IF NOT EXISTS public.codewords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS codewords_sort_idx ON public.codewords (sort_order ASC, word ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.codewords TO authenticated;
GRANT ALL ON public.codewords TO service_role;

ALTER TABLE public.codewords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read codewords" ON public.codewords;
CREATE POLICY "Authenticated can read codewords"
ON public.codewords
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Staff can insert codewords" ON public.codewords;
CREATE POLICY "Staff can insert codewords"
ON public.codewords
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

DROP POLICY IF EXISTS "Staff can update codewords" ON public.codewords;
CREATE POLICY "Staff can update codewords"
ON public.codewords
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

DROP POLICY IF EXISTS "Staff can delete codewords" ON public.codewords;
CREATE POLICY "Staff can delete codewords"
ON public.codewords
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

DROP TRIGGER IF EXISTS update_codewords_updated_at ON public.codewords;
CREATE TRIGGER update_codewords_updated_at
BEFORE UPDATE ON public.codewords
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.codewords (word, description, sort_order)
SELECT * FROM (VALUES
  ('Contacto', 'Buscar contacto con el enemigo para obtener info y abrir el round', 10),
  ('Pop', 'Flash pop coordinada para entrar a un site o tomar control de zona', 20),
  ('Hero', 'Jugada individual agresiva — un jugador busca hacer una play de impacto', 30),
  ('Sólidos', 'Jugar posiciones default seguras, no peekear innecesariamente, ganar por economía', 40),
  ('Pausa / Freeze', 'Frenar la ejecución, esperar info, no commitear hasta nuevo call', 50),
  ('Marotei', 'Rotación rápida al otro site, fakeando presencia en el actual', 60),
  ('Deathmatch', 'Round suelto sin estructura — cada uno busca su duelo, usado en ecos o últimas rondas', 70)
) AS seed(word, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.codewords LIMIT 1);

NOTIFY pgrst, 'reload schema';
