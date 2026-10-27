CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  wa_id TEXT UNIQUE NOT NULL,
  state JSONB NOT NULL DEFAULT '{"step":"menu"}'::jsonb,
  human_requested BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  wa_message_id TEXT UNIQUE,
  wa_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  message_type TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages(created_at);
CREATE INDEX IF NOT EXISTS messages_wa_id_idx ON messages(wa_id, created_at DESC);
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  wa_id TEXT NOT NULL,
  full_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  location TEXT,
  request TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','qualified','converted','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads(created_at DESC);
CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  wa_id TEXT NOT NULL,
  full_name TEXT,
  phone TEXT NOT NULL,
  service TEXT NOT NULL,
  booking_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','confirmed','cancelled','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_at_idx ON bookings(booking_at);
CREATE TABLE IF NOT EXISTS outbox (
  id BIGSERIAL PRIMARY KEY,
  wa_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox(next_attempt_at) WHERE sent_at IS NULL;
CREATE TABLE IF NOT EXISTS processed_webhooks (event_id TEXT PRIMARY KEY, received_at TIMESTAMPTZ NOT NULL DEFAULT now());
