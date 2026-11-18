# 07 — Failure drills

Status: **not started.** Do these yourself before any resume line. Write one paragraph per drill: what you did, what the system did, what would have been wrong.

Run them against the local saga (host processes are fine). Watch Postgres and the RabbitMQ queue, not just the UI.

## 1. Two buyers, one seat

Open two clients. Hold the same seat at the same time. One gets 201, the other 409. Confirm the partial unique index is what decided it. If both succeed, the index is missing and the lab is not done.

## 2. Double click

Send `POST /holds` twice with the same idempotency key. One order, one set of holds. Send pay twice with the same key. One charge row in the payments database.

## 3. Decline

Pay with `0000`. Order becomes `cancelled`, holds become `released`, the seat is selectable again, `order.cancelled` was published.

## 4. Hold expires

Hold a seat and wait out the five minutes (or set expiry to 15 seconds in dev). The seat shows as free. `POST /pay` returns 409 and does not create a charge.

## 5. Payment timeout after capture

Make the payments service capture the charge, then drop the response (sleep past the 2 second timeout, or kill the connection after insert). Orders must call `GET /charges` and confirm the order. It must not release the seat.

This is the story on the resume. If you have not watched it happen, do not claim it.

## 6. Payment timeout before the charge exists

Drop the request before payments inserts a row. Orders retries once, or returns 503 and leaves the hold in place. There is still zero or one charge row, never two.

## 7. Broker down

Stop RabbitMQ. Hold a seat. The HTTP call still returns 201. The outbox row sits with `published_at` null. Start RabbitMQ. The publisher drains it. The user was never blocked on the broker.

## 8. Crash after publish

Harder, and optional. If you can pause the publisher after the broker accepts and before `published_at` is set, you should see a duplicate message. The audit consumer must not break on the duplicate.

## Resume gate

All of 1–7 have a paragraph in your own words, and you can redraw drill 5 with this file closed. Then the Projects line in `../README.md` is allowed.
