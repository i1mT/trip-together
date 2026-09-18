ALTER TABLE public_itineraries ADD COLUMN code TEXT NOT NULL DEFAULT '';
ALTER TABLE public_itineraries ADD COLUMN introduction TEXT NOT NULL DEFAULT '';
UPDATE public_itineraries SET code=(SELECT printf('%08X', position) FROM (SELECT id,row_number() OVER (ORDER BY id) AS position FROM public_itineraries) numbered WHERE numbered.id=public_itineraries.id);
CREATE UNIQUE INDEX public_itineraries_code ON public_itineraries(code);
