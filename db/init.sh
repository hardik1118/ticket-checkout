#!/bin/bash
# Applied by the Postgres image on first boot. Each file targets one database.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -f /db/000_create_databases.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname catalog -f /db/catalog/001_schema.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname catalog -f /db/catalog/002_seed.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname orders -f /db/orders/001_schema.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname payments -f /db/payments/001_schema.sql
