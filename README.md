# Ticket checkout lab

A personal project to own one flow end to end: numbered seats, a five-minute hold, payment, and a clean rollback. The point is that you can draw it, break it, and explain it. AI can write the code. You keep the decisions.

Work stories stay in `projects/` (AICOS, Nebula). This folder is the lab.

## How we work

1. Read the phase file. Disagree in writing before any code for that phase.
2. You write the design in a few lines, then AI implements only that slice.
3. You read the diff and delete anything you cannot explain out loud.
4. The next day you redraw the slice with the file closed.
5. We do not start the next phase until that redraw works.

Design is confirmed (`docs/00-product.md` through `docs/07-failure-drills.md`). Slice 1 is the schema and seed in `db/`. Slice 2 is the catalog service in `services/catalog`. Slice 3 is the hold in `services/orders`. Pay and RabbitMQ wait until you can explain the hold transaction.

## Files

| File | What it locks | Build it when |
| --- | --- | --- |
| `docs/00-product.md` | The one user journey, and what we refuse to add | Confirmed |
| `docs/01-architecture.md` | Three services, who owns the seat, sync vs async | Confirmed |
| `docs/02-data-model.md` | Tables, hold expiry, the unique seat rule | Done in `db/` (schema and seed) |
| `docs/03-apis-and-events.md` | HTTP contracts and RabbitMQ messages | With the saga |
| `docs/04-saga.md` | Hold → pay → confirm, and the timeout case | Core of the lab |
| `docs/05-frontend.md` | Next.js screens and the BFF | After checkout works with curl |
| `docs/06-devops.md` | Compose, then one CI workflow | After the saga runs locally |
| `docs/07-failure-drills.md` | Breaks you run yourself | Before any resume line |

## Database (slice 1)

Postgres 16 in Docker. One server, three databases (`catalog`, `orders`, `payments`). SQL files in `db/` run once, the first time the data volume is created.

Docker runs in Ubuntu under WSL, not in Windows PowerShell. From that distro, in this folder:

```
wsl -d ubuntu
cd "/mnt/c/Users/hardik.gandhi/OneDrive - InTimeTec Visionsoft Pvt. Ltd.,/learnings/personal-projects/ticket-checkout"
docker compose up -d
docker compose exec postgres psql -U postgres -d catalog -c "\dt"
```

Connection strings, user `postgres`, password `postgres`:

- `postgres://postgres:postgres@localhost:5432/catalog`
- `postgres://postgres:postgres@localhost:5432/orders`
- `postgres://postgres:postgres@localhost:5432/payments`

Editing a SQL file does not change a database that already initialized. `docker compose down -v` deletes the volume so the next start runs the scripts again.

## Catalog service (slice 2)

Read-only NestJS app. It uses `pg` against the `catalog` database and does not know who holds a seat. Node and pnpm are on Windows. Postgres stays in Ubuntu under WSL, published on port 5432.

```
pnpm install
pnpm catalog
```

Then:

```
curl http://localhost:3001/events
curl http://localhost:3001/events/11111111-1111-4111-8111-111111111111
curl http://localhost:3001/events/11111111-1111-4111-8111-111111111111/seats
```

`services/catalog/.env.example` shows `DATABASE_URL` and `PORT`. Those values are the defaults, so a `.env` file is optional.

## Orders hold (slice 3)

NestJS app on port 3002. It calls catalog over HTTP for labels and prices, then writes the `orders` database. It does not open the catalog database, and it does not publish to RabbitMQ. The `SeatHeld` row sits in `outbox` with `published_at` null.

Start catalog first, then orders:

```
pnpm catalog
pnpm orders
```

```
Set-Content hold.json -Value '{"eventId":"11111111-1111-4111-8111-111111111111","seatIds":["11111111-1111-4111-8111-0000000000a1"],"idempotencyKey":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}'
curl.exe -sS -X POST http://localhost:3002/holds -H "Content-Type: application/json" --data-binary "@hold.json"
```

The same key again returns 200 and the same order. A second key for that seat returns 409 `seat_taken`. `GET /events/:eventId/availability` shows the seat as held. `GET /orders/:orderId` reads the order back.

## Stack (deliberately small)

NestJS, Postgres, Redis, RabbitMQ, Next.js, Docker Compose. Same family as AICOS and Nebula, so interview answers connect to work.

Left out until you can whiteboard checkout from memory: Kubernetes, a service mesh, Kafka, gRPC, GraphQL, event sourcing, a real auth provider.

## Resume rule

This does not replace AICOS or Nebula. One Projects line, only after `docs/07-failure-drills.md` is done from memory:

> Personal ticket checkout: Nest services, Postgres, RabbitMQ, Next.js. Orchestrated seat hold and payment with an outbox and idempotent charges. Compensating release when the provider times out.

One decision and one failure. No stack paragraph.
