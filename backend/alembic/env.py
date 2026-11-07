"""Alembic environment configuration — sync-only, no async engine import."""
import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import pool, engine_from_config
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

# Make sure `app` is importable from the backend directory
sys.path.insert(0, str(Path(__file__).parents[1]))

from app.env import load_project_env

load_project_env(Path(__file__).parents[2] / ".env.local")

# Import Base and all models so Alembic sees all table metadata.
# We import Base from app.database but patch get_settings to use env vars
# already loaded above — avoids the pydantic-settings JSON parse issue.
from app.database import Base  # noqa: F401
import app.models  # noqa: F401 — registers all ORM models against Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override the URL from environment (takes priority over alembic.ini placeholder)
database_url = os.environ.get("DATABASE_URL", "")
# Alembic needs a sync driver — swap asyncpg → psycopg2
sync_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
if sync_url:
    config.set_main_option("sqlalchemy.url", sync_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
