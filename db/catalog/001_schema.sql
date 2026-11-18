-- Reference data. No seat status lives here. Availability belongs to the orders database.

create table events (
  id uuid primary key,
  name text not null,
  starts_at timestamptz not null,
  venue text not null
);

create table seats (
  id uuid primary key,
  event_id uuid not null references events (id),
  label text not null,
  price_cents integer not null check (price_cents >= 0),
  unique (event_id, label)
);
