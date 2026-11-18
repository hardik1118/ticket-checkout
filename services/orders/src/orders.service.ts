import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { CatalogClient, CatalogSeat } from './catalog.client';

export const PG_POOL = 'PG_POOL';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type HoldRequest = {
  eventId: string;
  seatIds: string[];
  idempotencyKey: string;
};

type HoldSeat = { seatId: string; label: string };

type HoldBody = {
  orderId: string;
  expiresAt: string;
  amountCents: number;
  seats: HoldSeat[];
};

type HoldRow = {
  order_id: string;
  status: string;
  amount_cents: number;
  seat_id: string;
  seat_label: string;
  expires_at: Date;
};

type ActiveHoldRow = {
  seat_id: string;
  status: 'held' | 'sold';
  expires_at: Date;
};

type UniqueViolation = {
  code: '23505';
  constraint?: string;
};

@Injectable()
export class OrdersService implements OnModuleDestroy {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly catalog: CatalogClient,
  ) {}

  onModuleDestroy() {
    return this.pool.end();
  }

  async availability(eventId: string) {
    this.assertUuid(eventId);
    const seats = await this.catalog.listSeats(eventId);
    if (seats.length === 0) {
      return [];
    }

    const active = await this.pool.query<ActiveHoldRow>(
      `select seat_id, status, expires_at
       from holds
       where seat_id = any($1::uuid[])
         and (
           status = 'sold'
           or (status = 'held' and expires_at > now())
         )`,
      [seats.map((seat) => seat.id)],
    );
    const bySeat = new Map(active.rows.map((row) => [row.seat_id, row]));

    return seats.map((seat) => {
      const row = bySeat.get(seat.id);
      if (!row) {
        return { seatId: seat.id, status: 'free' as const };
      }
      if (row.status === 'held') {
        return {
          seatId: seat.id,
          status: 'held' as const,
          expiresAt: row.expires_at.toISOString(),
        };
      }
      return { seatId: seat.id, status: 'sold' as const };
    });
  }

  async createHold(body: unknown): Promise<{ created: boolean; body: HoldBody }> {
    const request = this.readHoldRequest(body);
    const existing = await this.findByIdempotencyKey(request.idempotencyKey);
    if (existing) {
      return { created: false, body: existing };
    }

    const catalogSeats = await this.catalog.listSeats(request.eventId);
    const byId = new Map(catalogSeats.map((seat) => [seat.id, seat]));
    const unknown = request.seatIds.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      throw new HttpException(
        { error: 'unknown_seat', seatIds: unknown },
        HttpStatus.BAD_REQUEST,
      );
    }
    const seats = request.seatIds.map((id) => byId.get(id) as CatalogSeat);

    const client = await this.pool.connect();
    try {
      return await this.insertHold(client, request, seats);
    } finally {
      client.release();
    }
  }

  async getOrder(orderId: string) {
    this.assertUuid(orderId);
    const result = await this.pool.query<HoldRow>(
      `select o.id as order_id, o.status, o.amount_cents,
              h.seat_id, h.seat_label, h.expires_at
       from orders o
       join holds h on h.order_id = o.id
       where o.id = $1
       order by h.seat_label`,
      [orderId],
    );
    if (result.rows.length === 0) {
      throw new HttpException({ error: 'order_not_found' }, HttpStatus.NOT_FOUND);
    }
    return this.toOrder(result.rows);
  }

  private async insertHold(
    client: PoolClient,
    request: HoldRequest,
    seats: CatalogSeat[],
  ): Promise<{ created: boolean; body: HoldBody }> {
    const orderId = randomUUID();
    const amountCents = seats.reduce((sum, seat) => sum + seat.priceCents, 0);

    try {
      await client.query('begin');
      const clock = await client.query<{ expires_at: Date }>(
        `select now() + interval '5 minutes' as expires_at`,
      );
      const expiresAt = clock.rows[0].expires_at;

      await client.query(
        `insert into orders (id, idempotency_key, status, amount_cents)
         values ($1, $2, 'pending_payment', $3)`,
        [orderId, request.idempotencyKey, amountCents],
      );

      for (const seat of seats) {
        await client.query(
          `insert into holds (
             id, event_id, seat_id, seat_label, price_cents, order_id, status, expires_at
           ) values ($1, $2, $3, $4, $5, $6, 'held', $7)`,
          [
            randomUUID(),
            request.eventId,
            seat.id,
            seat.label,
            seat.priceCents,
            orderId,
            expiresAt,
          ],
        );
      }

      // Written in this transaction. published_at stays null; nothing talks to RabbitMQ yet.
      await client.query(
        `insert into outbox (id, aggregate_id, type, payload)
         values ($1, $2, 'SeatHeld', $3::jsonb)`,
        [
          randomUUID(),
          orderId,
          JSON.stringify({
            eventId: request.eventId,
            orderId,
            type: 'SeatHeld',
            occurredAt: new Date().toISOString(),
            seatIds: seats.map((seat) => seat.id),
          }),
        ],
      );

      await client.query('commit');
      return {
        created: true,
        body: {
          orderId,
          expiresAt: expiresAt.toISOString(),
          amountCents,
          seats: seats
            .map((seat) => ({ seatId: seat.id, label: seat.label }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        },
      };
    } catch (error) {
      await client.query('rollback');
      if (this.isUniqueViolation(error)) {
        return this.recoverUniqueViolation(error, request);
      }
      throw error;
    }
  }

  private async recoverUniqueViolation(
    error: UniqueViolation,
    request: HoldRequest,
  ): Promise<{ created: boolean; body: HoldBody }> {
    if (error.constraint === 'orders_idempotency_key_key') {
      const existing = await this.findByIdempotencyKey(request.idempotencyKey);
      if (existing) {
        return { created: false, body: existing };
      }
    }

    const taken = await this.pool.query<{ seat_id: string }>(
      `select seat_id
       from holds
       where seat_id = any($1::uuid[])
         and status in ('held', 'sold')`,
      [request.seatIds],
    );
    throw new HttpException(
      { error: 'seat_taken', seatIds: taken.rows.map((row) => row.seat_id) },
      HttpStatus.CONFLICT,
    );
  }

  private async findByIdempotencyKey(key: string): Promise<HoldBody | undefined> {
    const result = await this.pool.query<HoldRow>(
      `select o.id as order_id, o.status, o.amount_cents,
              h.seat_id, h.seat_label, h.expires_at
       from orders o
       join holds h on h.order_id = o.id
       where o.idempotency_key = $1
       order by h.seat_label`,
      [key],
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    const row = result.rows[0];
    return {
      orderId: row.order_id,
      expiresAt: row.expires_at.toISOString(),
      amountCents: row.amount_cents,
      seats: result.rows.map((hold) => ({
        seatId: hold.seat_id,
        label: hold.seat_label,
      })),
    };
  }

  private toOrder(rows: HoldRow[]) {
    const row = rows[0];
    return {
      id: row.order_id,
      status: row.status,
      amountCents: row.amount_cents,
      expiresAt: row.expires_at.toISOString(),
      seats: rows.map((hold) => ({
        seatId: hold.seat_id,
        label: hold.seat_label,
      })),
    };
  }

  private readHoldRequest(body: unknown): HoldRequest {
    if (body === null || typeof body !== 'object') {
      throw new HttpException({ error: 'invalid_body' }, HttpStatus.BAD_REQUEST);
    }
    const record = body as Record<string, unknown>;
    if (
      typeof record.eventId !== 'string' ||
      typeof record.idempotencyKey !== 'string' ||
      !Array.isArray(record.seatIds)
    ) {
      throw new HttpException({ error: 'invalid_body' }, HttpStatus.BAD_REQUEST);
    }
    this.assertUuid(record.eventId);
    this.assertUuid(record.idempotencyKey);
    if (
      record.seatIds.length === 0 ||
      record.seatIds.some((id) => typeof id !== 'string')
    ) {
      throw new HttpException({ error: 'invalid_body' }, HttpStatus.BAD_REQUEST);
    }
    const seatIds = record.seatIds as string[];
    for (const seatId of seatIds) {
      this.assertUuid(seatId);
    }
    if (new Set(seatIds).size !== seatIds.length) {
      throw new HttpException(
        { error: 'duplicate_seats' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (seatIds.length > 4) {
      throw new HttpException({ error: 'too_many_seats' }, HttpStatus.BAD_REQUEST);
    }
    return {
      eventId: record.eventId,
      seatIds,
      idempotencyKey: record.idempotencyKey,
    };
  }

  private assertUuid(value: string) {
    if (!UUID.test(value)) {
      throw new HttpException({ error: 'invalid_id' }, HttpStatus.BAD_REQUEST);
    }
  }

  private isUniqueViolation(error: unknown): error is UniqueViolation {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === '23505'
    );
  }
}
