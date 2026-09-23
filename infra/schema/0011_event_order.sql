ALTER TABLE events ADD COLUMN sort_order INTEGER;
CREATE INDEX events_trip_order ON events(trip_id, sort_order);
