import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { CatalogClient } from './catalog.client';
import { OrdersController } from './orders.controller';
import { OrdersService, PG_POOL } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({
          connectionString:
            process.env.DATABASE_URL ??
            'postgres://postgres:postgres@localhost:5432/orders',
        }),
    },
    CatalogClient,
    OrdersService,
  ],
})
export class AppModule {}
