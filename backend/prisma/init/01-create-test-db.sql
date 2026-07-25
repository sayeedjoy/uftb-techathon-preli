-- Dedicated database for the integration test suite (plan risk R5: test isolation).
-- Runs once, on first initialisation of the Postgres volume.
CREATE DATABASE scsrg_test OWNER scsrg;
