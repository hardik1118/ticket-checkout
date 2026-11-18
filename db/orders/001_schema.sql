-- Checkout state. seat_id and event_id are copied from catalog. There is no foreign key to catalog.

-- Created before holds: a hold row points at an order, so the order row has to exist first.
create table orders (
  id uuid primary key,
  idempotency_key text not null unique,
  status text not null check (status in ('pending_payment', 'confirmed', 'cancelled', 'expired')),
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create table holds (
  id uuid primary key,
  event_id uuid not null,
  seat_id uuid not null,
  seat_label text not null,
  price_cents integer not null check (price_cents >= 0),
  order_id uuid not null references orders (id),
  status text not null check (status in ('held', 'sold', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- At most one held or sold row per seat. Released rows stay in the table and drop out of this index.
create unique index holds_one_active_seat
  on holds (seat_id)
  where status in ('held', 'sold');

create table outbox (
  id uuid primary key,
  aggregate_id uuid not null,
  type text not null check (type in ('SeatHeld', 'OrderConfirmed', 'OrderCancelled')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
