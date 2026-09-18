ALTER TABLE public_itineraries ADD COLUMN code TEXT NOT NULL DEFAULT '';
ALTER TABLE public_itineraries ADD COLUMN introduction TEXT NOT NULL DEFAULT '';
UPDATE public_itineraries SET code=
  substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(random() & 0x7fffffff) % 32 + 1,1) ||
  substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(random() & 0x7fffffff) % 32 + 1,1) ||
  substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(random() & 0x7fffffff) % 32 + 1,1) ||
  substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(random() & 0x7fffffff) % 32 + 1,1) ||
  substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(random() & 0x7fffffff) % 32 + 1,1) ||
  substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(random() & 0x7fffffff) % 32 + 1,1) ||
  substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(random() & 0x7fffffff) % 32 + 1,1) ||
  substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(random() & 0x7fffffff) % 32 + 1,1);
CREATE UNIQUE INDEX public_itineraries_code ON public_itineraries(code);
