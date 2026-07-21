\set ON_ERROR_STOP on

-- Execute as a PostgreSQL administrator after migration 009.
-- Required psql variables: api_login, api_password, worker_login, worker_password.
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'api_login',:'api_password') WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'api_login') \gexec
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'worker_login',:'worker_password') WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'worker_login') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L',:'api_login',:'api_password') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L',:'worker_login',:'worker_password') \gexec
SELECT format('GRANT tonatiuh_api TO %I',:'api_login') \gexec
SELECT format('GRANT tonatiuh_worker TO %I',:'worker_login') \gexec
