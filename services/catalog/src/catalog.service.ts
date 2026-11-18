import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EventRow = {
  id: string;
  name: string;
  starts_at: Date;
  venue: string;
};

type SeatRow = {
  id: string;
  label: string;
  price_cents: number;
};

@Injectable()
export class CatalogService implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  onModuleDestroy() {
    return this.pool.end();
  }

  async listEvents() {
    const result = await this.pool.query<EventRow>(
      'select id, name, starts_at, venue from events order by starts_at',
    );
    return result.rows.map((row) => this.toEvent(row));
  }

  async getEvent(eventId: string) {
    this.assertUuid(eventId);
    const row = await this.findEvent(eventId);
    if (!row) {
      throw new HttpException({ error: 'event_not_found' }, HttpStatus.NOT_FOUND);
    }
    return this.toEvent(row);
  }

  async listSeats(eventId: string) {
    this.assertUuid(eventId);
    const event = await this.findEvent(eventId);
    if (!event) {
      throw new HttpException({ error: 'event_not_found' }, HttpStatus.NOT_FOUND);
    }
    const result = await this.pool.query<SeatRow>(
      'select id, label, price_cents from seats where event_id = $1 order by label',
      [eventId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      label: row.label,
      priceCents: row.price_cents,
    }));
  }

  private async findEvent(eventId: string) {
    const result = await this.pool.query<EventRow>(
      'select id, name, starts_at, venue from events where id = $1',
      [eventId],
    );
    return result.rows[0];
  }

  private toEvent(row: EventRow) {
    return {
      id: row.id,
      name: row.name,
      startsAt: row.starts_at.toISOString(),
      venue: row.venue,
    };
  }

  private assertUuid(value: string) {
    if (!UUID.test(value)) {
      throw new HttpException({ error: 'invalid_id' }, HttpStatus.BAD_REQUEST);
    }
  }
}
