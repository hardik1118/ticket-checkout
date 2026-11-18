import { Controller, Get, Param } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('events')
  listEvents() {
    return this.catalog.listEvents();
  }

  @Get('events/:eventId')
  getEvent(@Param('eventId') eventId: string) {
    return this.catalog.getEvent(eventId);
  }

  @Get('events/:eventId/seats')
  listSeats(@Param('eventId') eventId: string) {
    return this.catalog.listSeats(eventId);
  }
}
