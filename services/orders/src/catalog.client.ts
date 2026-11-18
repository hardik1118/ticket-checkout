import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export type CatalogSeat = {
  id: string;
  label: string;
  priceCents: number;
};

@Injectable()
export class CatalogClient {
  private readonly baseUrl =
    process.env.CATALOG_BASE_URL ?? 'http://localhost:3001';

  async listSeats(eventId: string): Promise<CatalogSeat[]> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/events/${eventId}/seats`, {
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      throw new HttpException(
        { error: 'catalog_unavailable' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (response.status === 404) {
      throw new HttpException({ error: 'event_not_found' }, HttpStatus.NOT_FOUND);
    }
    if (!response.ok) {
      throw new HttpException(
        { error: 'catalog_unavailable' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    return (await response.json()) as CatalogSeat[];
  }
}
