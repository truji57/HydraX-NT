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
    _migrate_add_color()
    _migrate_copy_enable()
    _migrate_template_id()
    _migrate_slave_templates()


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


def _migrate_add_color():
    try:
        with engine.connect() as conn:
            result = conn.exec_driver_sql(
                "SELECT name FROM pragma_table_info('accounts') WHERE name='color'"
            ).fetchone()
            if not result:
                from app.utils.logger import get_logger
                logger = get_logger("hydrax.db")
                logger.info("Migrating: adding accounts.color column")
                conn.exec_driver_sql("ALTER TABLE accounts ADD COLUMN color VARCHAR(7) DEFAULT '#3b82f6'")
                conn.commit()
    except Exception:
        pass


def _migrate_copy_enable():
    """Add copy_enable to accounts, copy_modify to slave_config and slave_templates."""
    try:
        with engine.connect() as conn:
            for col, table in [("copy_enable", "accounts"), ("copy_modify", "slave_config"), ("copy_modify", "slave_templates"), ("sync_close", "slave_config"), ("sync_close", "slave_templates")]:
                result = conn.exec_driver_sql(
                    f"SELECT name FROM pragma_table_info('{table}') WHERE name='{col}'"
                ).fetchone()
                if not result:
                    from app.utils.logger import get_logger
                    logger = get_logger("hydrax.db")
                    logger.info(f"Migrating: adding {table}.{col} column")
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {col} BOOLEAN DEFAULT 1")
                conn.commit()
    except Exception:
        pass


def _migrate_template_id():
    try:
        with engine.connect() as conn:
            result = conn.exec_driver_sql(
                "SELECT name FROM pragma_table_info('slave_config') WHERE name='template_id'"
            ).fetchone()
            if not result:
                from app.utils.logger import get_logger
                logger = get_logger("hydrax.db")
                logger.info("Migrating: adding slave_config.template_id column")
                conn.exec_driver_sql("ALTER TABLE slave_config ADD COLUMN template_id VARCHAR(36) DEFAULT NULL")
                conn.commit()
    except Exception:
        pass


def _migrate_slave_templates():
    try:
        with engine.connect() as conn:
            result = conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='slave_templates'"
            ).fetchone()
            if not result:
                from app.utils.logger import get_logger
                logger = get_logger("hydrax.db")
                logger.info("Migrating: creating slave_templates table")
                Base.metadata.create_all(bind=engine, tables=[Base.metadata.tables["slave_templates"]])
                conn.commit()
    except Exception:
        pass
