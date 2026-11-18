# 01 — Architecture

Status: **confirmed.** Depends on `00-product.md`.

## Boxes

```
Browser
  │
  ▼
Next.js  (BFF: the browser talks only to this app)
  │
  ├── GET  catalog     events, seat labels, prices
  └── POST orders      hold, pay, checkout status
                │
                └── POST payments   charge (orders only, never the browser)

orders ──facts after commit──▶ RabbitMQ
   │                            │
   ▼                            ▼
orders DB                   payments DB
catalog DB                  Redis (hold countdown is in Postgres; Redis is the idempotency cache)
```

Three Nest services plus the Next.js app:

| Service | Owns | Does not own |
| --- | --- | --- |
| Catalog | Event name, time, seat identity, price | Who currently holds the seat |
| Orders | Holds, orders, the saga, the outbox | Charging a card |
| Payments | One charge per idempotency key, captured or declined | Seats |

Catalog is reference data. It changes only when we re-seed. Availability lives in the order service, because "this seat is free, held, or sold" is one consistency boundary. If catalog and orders both wrote seat status, every sale would be a distributed transaction. We are not doing that.

## Why three services

Two would be more honest for production at this size (catalog can be a table). Three is the lab: you need a sync call that can time out (orders → payments) and a database you must not join across (orders must not `SELECT` from the payments tables). Catalog exists so the read model and the write model are obviously different.

If you cannot explain that split in an interview, collapse catalog into orders and say so. Do not invent a fourth service.

## Sync vs async

| Step | How | Why |
| --- | --- | --- |
| Load events and the seat map | Sync HTTP, catalog and orders | The screen needs the answer now |
| Create the hold | Sync HTTP to orders | The user is waiting to see "held" |
| Take money | Sync HTTP, orders → payments | The saga needs the result before it confirms or releases |
| Tell the rest of the system what happened | Async, outbox → RabbitMQ | `SeatHeld`, `OrderConfirmed`, `OrderCancelled` survive a broker blip |

The payment call is synchronous because the user is on the checkout page. The message bus is not how we learn whether this charge worked. The bus is how a committed fact leaves the service that committed it. Publishing inside the request, before commit, is the bug the outbox exists to remove.

## Data stores

- One Postgres server, **three databases**: `catalog`, `orders`, `payments`. Same server is a laptop compromise. Separate databases means no cross-database foreign keys and no shared tables. Say that out loud if someone calls it "microservices."
- RabbitMQ, one topic exchange `tickets`.
- Redis, used for the checkout idempotency key only. The seat hold itself is a Postgres row with `expires_at`, not a Redis key. The unique index is what stops two buyers. A Redis lock would expire and still need the database to be right.

## Request path (happy path)

1. Next.js server component reads catalog: event list.
2. Seat page reads catalog for labels and prices, and orders for current availability.
3. Buyer selects seats. Next.js route handler calls `POST /holds` on orders.
4. Orders, in one transaction, inserts the hold and an outbox row, or returns 409 if a seat is taken.
5. Buyer pays. Next.js calls `POST /orders/{id}/pay`. Orders calls payments with an idempotency key.
6. Payments returns captured. Orders, in a second transaction, marks seats sold and writes `OrderConfirmed` to the outbox.
7. A small publisher in the orders process reads the outbox and publishes to RabbitMQ.

Step 7 can lag. The user's confirmation does not wait for the broker.

## What we will say in an interview

- Gateway vs BFF: the Next.js app is the BFF. It is the only thing the browser calls. We are not putting Kong in front of a lab.
- Orchestration, not choreography: the order service decides the next step. Payments does not know what a seat is.
- DB per service: three databases, joins forbidden. Availability is copied into the order database as seat ids, not by reading catalog at sale time inside the same transaction.
