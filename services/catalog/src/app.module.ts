import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { CatalogController } from './catalog.controller';
import { CatalogService, PG_POOL } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({
          connectionString:
            process.env.DATABASE_URL ??
            'postgres://postgres:postgres@localhost:5432/catalog',
        }),
    },
    CatalogService,
  ],
})
export class AppModule {}
