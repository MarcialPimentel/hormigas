#!/bin/bash
# Runs once, the first time the database starts with an empty volume.
# Creates a Hormigas-only user and database so each game is walled off from the others.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-SQL
	CREATE ROLE hormigas WITH LOGIN PASSWORD '${HORMIGAS_DB_PASSWORD}';
	CREATE DATABASE hormigas OWNER hormigas;
SQL
