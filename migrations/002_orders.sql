CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  wa_id TEXT NOT NULL,
  full_name TEXT,
  phone TEXT NOT NULL,
  item_description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','confirmed','fulfilled','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);
