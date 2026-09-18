CREATE TABLE public_itineraries (
 id TEXT PRIMARY KEY,
 trip_id TEXT NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 search_text TEXT NOT NULL,
 snapshot TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX public_itineraries_updated ON public_itineraries(updated_at DESC,id);
CREATE TABLE itinerary_copies (
 member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 public_id TEXT NOT NULL,
 trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
 PRIMARY KEY(member_id,request_id)
);
