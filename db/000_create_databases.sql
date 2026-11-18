-- One Postgres server, three databases. Foreign keys cannot cross these boundaries.
create database catalog;
create database orders;
create database payments;
