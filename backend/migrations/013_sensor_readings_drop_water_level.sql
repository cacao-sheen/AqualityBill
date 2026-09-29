-- Water level was part of the original sensor_readings design, but the
-- current IoT hardware build only has pH, turbidity, TDS, and temperature
-- sensors -- there is no tank level/flow sensor. water_level_cm was also
-- required on every ingested reading, which would reject all payloads from
-- the real ESP32 build. Dropping the column so it stops being enforced.
--
-- Run this once in the Supabase SQL Editor, after 012.

alter table public.sensor_readings drop column if exists water_level_cm;
