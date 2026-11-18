# 03 — APIs and events

Status: **confirmed.** Implement together with `04-saga.md`, after the schema exists. Until then, exercise the database with SQL only.

The browser calls Next.js only. Next.js calls the services below. Service-to-service calls are orders → payments, and nothing else.

## Catalog

```
GET /events
GET /events/:eventId
GET /events/:eventId/seats
```

Seat payload is identity and price only: `{ id, label, priceCents }`. No availability. Catalog does not know.

## Orders

```
GET  /events/:eventId/availability
     → [{ seatId, status: "free" | "held" | "sold", expiresAt? }]

POST /holds
     body: { eventId, seatIds: string[], idempotencyKey: string }
     201 { orderId, expiresAt, amountCents, seats: [{ seatId, label }] }
     409 { error: "seat_taken", seatIds: [...] }
     200 same body, when the idempotency key already exists

GET  /orders/:orderId
     → { id, status, amountCents, expiresAt, seats }

POST /orders/:orderId/pay
     body: { idempotencyKey: string, card: "4242" | "0000" }
     200 { status: "confirmed" }
     200 { status: "cancelled", reason: "declined" }
     409 if the hold has expired
```

`4242` captures. `0000` declines. That is the whole fake provider. No other card numbers.

`POST /holds` is one transaction: insert order, insert holds, insert outbox `SeatHeld`, or roll all of it back on unique violation.

## Payments

Called by the order service, not by the browser.

```
POST /charges
     body: { orderId, amountCents, idempotencyKey }
     200 { chargeId, status: "captured" | "declined" }

GET  /charges?idempotencyKey=
     200 the stored charge, or 404
```

`GET` is how orders recovers from a timeout. See `04-saga.md`.

## Events (RabbitMQ)

Exchange: `tickets`, topic.

| Routing key | Publisher | When |
| --- | --- | --- |
| `order.seat_held` | orders outbox | Hold transaction committed |
| `order.confirmed` | orders outbox | Seats marked sold |
| `order.cancelled` | orders outbox | Hold released after decline, timeout, or expiry |

Payload, all three:

```json
{
  "eventId": "uuid",
  "orderId": "uuid",
  "type": "OrderConfirmed",
  "occurredAt": "2026-11-13T12:00:00Z",
  "seatIds": ["uuid"]
}
```

No consumer in v1 is required for the user journey. We still publish, and we log consumption in the order service (a queue `orders.audit` bound to `order.*`) so you can see a message leave and come back. A consumer that does real work is a later phase, not a reason to block checkout.

## Contract rules

- Money is integer cents.
- Ids are UUID strings.
- Errors are `{ error: "snake_case", ... }`.
- Every mutating request from the buyer carries an idempotency key.
- Orders never reads the payments database. It only uses the payments HTTP API.
