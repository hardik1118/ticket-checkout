import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { OrdersService } from './orders.service';

type StatusReply = { status(code: number): void };

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('events/:eventId/availability')
  availability(@Param('eventId') eventId: string) {
    return this.orders.availability(eventId);
  }

  @Post('holds')
  async createHold(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: StatusReply,
  ) {
    const result = await this.orders.createHold(body);
    reply.status(result.created ? 201 : 200);
    return result.body;
  }

  @Get('orders/:orderId')
  getOrder(@Param('orderId') orderId: string) {
    return this.orders.getOrder(orderId);
  }
}
