# 06 — DevOps

Status: **confirmed.** Compose comes after the saga runs as separate processes on the laptop. CI comes after Compose boots the happy path.

## Local, in order

1. **Before Compose.** Postgres, Redis, and RabbitMQ via Compose. The three Nest apps and Next.js run on the host with `pnpm dev`, so you can read logs and restart one service. This is the phase where you learn the saga.
2. **Full Compose.** All four apps containerized, one command, README at the repo root that a stranger can follow in five minutes. This is the phase you freeze.

Do not start at step 2. You will debug the saga through a Docker layer and learn neither.

## Compose services

| Service | Notes |
| --- | --- |
| `postgres` | One container, databases `catalog`, `orders`, `payments` created on first boot |
| `redis` | Idempotency cache |
| `rabbitmq` | Management UI on the host so you can see the exchange |
| `catalog`, `orders`, `payments` | Nest, health on `/health` |
| `web` | Next.js |

Healthchecks gate app startup on Postgres and RabbitMQ. No Kubernetes, no Helm, no Argo. You already have that story from AICOS. Repeating it here does not add a failure you can defend.

## Config

Environment variables, twelve-factor style: database URL, RabbitMQ URL, Redis URL, payments base URL, port. No Vault. A `.env.example` committed, `.env` gitignored.

## CI (one workflow)

On pull request:

1. Install and typecheck.
2. Unit tests for the saga decisions (timeout branch, idempotent replay, unique-violation → 409). These can run without Docker if the decision functions are pure.
3. Build the four images. Do not push them anywhere.

A Postgres integration test is worth one job if it stays under a few minutes. A cluster deploy is not.

## Observability, kept small

- Every log line includes `orderId` once a request has one.
- One OpenTelemetry trace is optional and only after the saga is boring: a span on `POST /pay` that continues into payments. If you add it, you should be able to point at the timeout in the trace. If you cannot, leave it out.
- No Prometheus, Grafana, or Loki in this lab.

## Done means

From a clean machine, `docker compose up` and the README get you to a confirmed order. You can also say what you would add for a real deploy (separate databases hosts, a pipeline that promotes an image, a secret store) without having built it.
