# 00 — Product

Status: **confirmed.**

## What we are building

A small ticket checkout for one venue. A person picks numbered seats for an event, holds them for five minutes, pays, and receives a ticket. If payment fails or times out, the seats come back.

This is a booking system, not a store. The hard part is that two people must not buy the same seat.

## The only journey that matters

1. See a short list of events.
2. Open one event and see a seat map. Seats are free, held, or sold.
3. Select up to four seats. The price is the sum of those seats.
4. Hold them. For five minutes nobody else can take them.
5. Pay with a fake card. The provider either captures or declines.
6. Land on a confirmation with the seat labels, or see the hold released and a clear reason.

Anything that is not on this path waits.

## Users

One role: the buyer. No admin, no organizer, no refund desk. Events and the seat map are seed data.

## In

- A handful of events, each with numbered seats and a price per seat.
- A hold that expires.
- One successful payment and one declined payment.
- Idempotent checkout, so a double click does not create two orders.
- A rollback when payment fails after the hold.

## Out

- Accounts, signup, OAuth, email, PDF tickets.
- Seat maps that look like a real venue diagram. A grid of labels is enough (`A1` … `A8`).
- Multiple holds for the same person across events.
- Refunds, transfers, waitlists, promo codes, partial payment.
- Mobile apps.
- Kubernetes and a real payment provider (Stripe and the rest).

## Done means

You can tell this journey in under a minute, and you can say what you refused to build and why. The why is: those features do not teach a new failure mode. The seat collision, the expired hold, and the payment timeout do.
