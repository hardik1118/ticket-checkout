# 04 — Saga

Status: **confirmed.** This is the core of the lab. Implement after `02-data-model.md` is migrated and seeded.

Pattern: **orchestration.** The order service is the orchestrator. Payments is a participant. It does not publish "please release the seat." It does not know seats exist.

We are not using choreography. In choreography, payments would emit `PaymentCaptured` and orders would have to notice. That hides the decision. For one checkout, the orchestrator is easier to draw and easier to debug. You should still be able to say what choreography would look like: payments emits, orders and a notification service react, and nobody owns the timeout.

## Step 1 — Hold

Trigger: `POST /holds`.

In one database transaction:

1. Insert `orders` with `status = pending_payment` and the idempotency key.
2. Insert one `holds` row per seat, `status = held`, `expires_at = now() + 5 minutes`.
3. Insert outbox `SeatHeld`.

If the idempotency key already exists, return the existing order and do not insert again.

If the partial unique index fires, roll back and return 409. Do not leave a partial hold (three seats inserted, the fourth lost).

The publisher sends `order.seat_held` after commit. The HTTP response does not wait for RabbitMQ.

## Step 2 — Pay

Trigger: `POST /orders/:id/pay`.

1. Load the order. If it is not `pending_payment`, return the state it already has (confirmed or cancelled). Paying twice is not a second charge.
2. If every hold is past `expires_at`, mark the order `expired`, release the holds, return 409. Do not call payments.
3. Call `POST /charges` with the **same** idempotency key the buyer sent, and a timeout of 2 seconds.

### Captured

In one transaction: holds → `sold`, order → `confirmed`, outbox `OrderConfirmed`.

### Declined

In one transaction: holds → `released`, order → `cancelled`, outbox `OrderCancelled` with reason `declined`.

### Timeout (the case that matters)

The charge might have succeeded and the response might have died.

1. Do not release the seats yet.
2. Call `GET /charges?idempotencyKey=`.
3. If payments has `captured`, run the captured transaction.
4. If payments has `declined`, run the declined transaction.
5. If payments returns 404, the charge never started. Retry `POST /charges` once with the same key.
6. If that retry also times out, leave the order in `pending_payment` and return 503 to the BFF. The hold is still theirs until `expires_at`. The user can press Pay again. The idempotency key makes the retry safe.

Releasing seats before step 2 is the bug. You would free a seat you might already have sold, or you would free it after taking the money.

## What is not in the saga

- No inventory service call. Availability is local to orders.
- No "pending charge" row on the order side. Payments is the record of the charge. Orders stores only the outcome on the order status.
- No refund compensations. Decline and timeout-before-capture release seats. A captured charge is final in this lab.

## Outbox publisher

A loop in the orders process, every second:

```sql
select * from outbox where published_at is null order by created_at limit 20;
```

Publish, then set `published_at`. If publish throws, leave `published_at` null and try next loop. Consumers must tolerate duplicates, because we can publish and crash before updating `published_at`.

That is at-least-once delivery. We do not pretend the bus is exactly-once.

## Draw this before you read the code

With the file closed, you should be able to sketch:

- the two transactions (hold, and confirm-or-cancel)
- where the idempotency key is checked (orders table, payments table)
- the timeout branch that queries before it compensates
- why the outbox row is in the same transaction as the hold
