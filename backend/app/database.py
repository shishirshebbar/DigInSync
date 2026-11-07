from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Engine and session are created lazily on first access
# so that importing this module (e.g. in alembic/env.py) does not
# immediately call get_settings() or create a DB connection.
_engine = None
_session_factory = None


def _get_engine():
    global _engine
    if _engine is None:
        from app.config import get_settings
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.environment == "development",
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )
    return _engine


def _get_session_factory():
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            _get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_db() -> AsyncSession:
    async with _get_session_factory()() as session:
        try:
            yield session
        finally:
            await session.close()
