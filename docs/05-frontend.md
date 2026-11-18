# 05 — Frontend

Status: **confirmed.** Start only after `POST /holds` and `POST /orders/:id/pay` work with curl.

Next.js App Router. The app is the BFF: route handlers call catalog, orders, and never payments directly. Payment goes through the order service so the browser cannot confirm an order by itself.

## Screens

| Route | Who renders | What it does |
| --- | --- | --- |
| `/` | Server component | Event list from catalog |
| `/events/[id]` | Server shell, client seat grid | Availability from orders, labels and prices from catalog. Selecting seats is client state |
| `/checkout/[orderId]` | Server load, client pay button | Shows the countdown from `expiresAt`. Pay sends the card token `4242` or `0000` |
| `/orders/[orderId]` | Server component | Confirmed, cancelled, or expired. Polls once a second only while `pending_payment` |

No global client store. Seat selection is component state. The server is the source of truth for holds and orders. TanStack Query is optional on the seat map if a refetch after 409 is awkward without it. Do not add it on day one by habit.

## Interactions worth being able to explain

- **Hold.** The client creates one UUID and keeps it in component state for that click. Retries reuse it. Refresh loses it; that is acceptable, because a second hold with a new key hits the unique seat index and returns 409 if the first hold is still live.
- **409 seat taken.** The grid refetches availability and clears the selection. The message names the seat label.
- **Countdown.** Rendered from `expiresAt` minus client clock. When it hits zero, the pay button disables and the page refetches the order. We do not trust the client clock for correctness. The server still rejects a late pay.
- **Double submit.** The pay button disables on first click. The idempotency key is what actually saves us if the disable fails.

## Rendering choices (interview lines)

- The event list is a server component because it is read-only and cheap. No loading spinner we have to invent.
- The seat grid is a client component because selection and the countdown are interactive.
- This is not RSC-versus-SSR trivia. It is "the parts that need state on the client are client components; the rest are not."

## Out

- Auth screens, optimistic updates that show a seat as held before the server says so, a visual seat-map library, animations, a design system beyond simple layout.
- Calling the payments service from the browser.

## Done means

You can buy two seats with `4242`, fail a second attempt on the same seats from another tab, and decline a payment with `0000` and watch the seats return.
