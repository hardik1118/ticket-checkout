# 02 — Data model

Status: **confirmed.** First code, when you say so: migrations and seed, nothing else.

The rule that makes the product true: **a seat has at most one active hold or one sold ticket.**

## Catalog database

Reference data. No status column.

```
events
  id              uuid pk
  name            text
  starts_at       timestamptz
  venue           text

seats
  id              uuid pk
  event_id        uuid  → events.id
  label           text          -- A1, A2, …
  price_cents     int
  unique (event_id, label)
```

Seed: 2 events, 16 seats each (rows A–B, seats 1–8). Prices differ so the total is not trivial.

## Orders database

```
holds
  id              uuid pk
  event_id        uuid          -- no FK to catalog
  seat_id         uuid          -- catalog seat id, copied
  seat_label      text          -- copied so orders can render without catalog
  price_cents     int           -- copied at hold time; later price edits do not change this order
  order_id        uuid          → orders.id
  status          text          -- held | sold | released
  expires_at      timestamptz
  created_at      timestamptz

orders
  id              uuid pk
  idempotency_key text unique
  status          text          -- pending_payment | confirmed | cancelled | expired
  amount_cents    int
  created_at      timestamptz

outbox
  id              uuid pk
  aggregate_id    uuid          -- order id
  type            text          -- SeatHeld | OrderConfirmed | OrderCancelled
  payload         jsonb
  created_at      timestamptz
  published_at    timestamptz null
```

### The unique seat rule

A partial unique index, not a check in application code:

```sql
create unique index holds_one_active_seat
  on holds (seat_id)
  where status in ('held', 'sold');
```

Two concurrent checkouts can both see the seat as free. Both try to insert. One commits. The other gets a unique violation and returns 409. That is the double-booking design. `SELECT` then `INSERT` without this index is a race.

Released and expired rows stay in the table for the story ("we released it"). They drop out of the index, so the seat can be held again.

### Hold expiry

`expires_at = now() + interval '5 minutes'` at insert time.

A hold is dead when `status = 'held'` and `expires_at < now()`. Two ways we notice:

- On read of the seat map, treat those rows as free.
- A sweeper in the order service runs every 30 seconds: `update holds set status = 'released' where status = 'held' and expires_at < now()`, and if that was the last live hold on the order, set the order to `expired`.

The sweeper is what frees the unique index. The read path must not trust a stale `held` row whose time has passed, in case the sweeper is late.

### Idempotency on the order

`orders.idempotency_key` is unique. The same key returns the same order. A double click does not insert a second hold. The client generates the key (UUID) when the user clicks Hold, and reuses it for the retry.

## Payments database

```
charges
  id                uuid pk
  idempotency_key   text unique
  order_id          uuid          -- no FK to orders
  amount_cents      int
  status            text          -- captured | declined
  created_at        timestamptz
```

The same idempotency key returns the stored row and does not charge again. This is the timeout story in `04-saga.md`: orders retries the charge, payments must not capture twice.

## Redis

One key: `checkout:{idempotency_key}` → order id, TTL 24 hours. Postgres remains the source of truth. Redis is the fast path so a duplicate request does not re-run the transaction. If Redis is empty or down, orders falls through to the unique key on `orders`.

## State

```
hold:    (none) → held → sold
                 ↘ released   (payment failed, user cancelled, or sweeper)

order:   pending_payment → confirmed
                         ↘ cancelled
                         ↘ expired
```

`sold` and `confirmed` are terminal. `released` allows a new hold on that seat. We do not delete rows.

## What you should be able to say

- Why the price is copied onto the hold.
- Why there is no foreign key from `holds.seat_id` to catalog.
- What the partial index does that application code cannot.
- Why expiry is a timestamp plus a sweeper, not a Redis `SETEX`.
