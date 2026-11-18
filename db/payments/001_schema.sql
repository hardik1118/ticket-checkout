-- One charge per idempotency key. order_id is a copied uuid: this database cannot see the orders tables.

create table charges (
  id uuid primary key,
  idempotency_key text not null unique,
  order_id uuid not null,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null check (status in ('captured', 'declined')),
  created_at timestamptz not null default now()
);
