-- Apply migrations in lexical order. This file intentionally stays small so
-- deployment systems can use server/migrations as the source of truth.
\i migrations/001_initial.sql

