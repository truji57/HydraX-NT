from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import logging

from app.config import settings

logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models import account, ticket_map, trade_log  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate_slave_ticket()


def _migrate_slave_ticket():
    try:
        with engine.connect() as conn:
            result = conn.exec_driver_sql(
                "SELECT type FROM pragma_table_info('ticket_map') WHERE name='slave_ticket'"
            ).fetchone()
            if result and result[0].upper() == "INTEGER":
                from app.utils.logger import get_logger
                logger = get_logger("hydrax.db")
                logger.info("Migrating ticket_map.slave_ticket from INTEGER to TEXT")
                conn.exec_driver_sql("ALTER TABLE ticket_map ADD COLUMN slave_ticket_tmp TEXT")
                conn.exec_driver_sql("UPDATE ticket_map SET slave_ticket_tmp = CAST(slave_ticket AS TEXT)")
                conn.exec_driver_sql("ALTER TABLE ticket_map DROP COLUMN slave_ticket")
                conn.exec_driver_sql("ALTER TABLE ticket_map RENAME COLUMN slave_ticket_tmp TO slave_ticket")
                conn.commit()
    except Exception:
        pass
