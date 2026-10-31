"""The Alembic migration must create exactly the schema the models describe."""

from pathlib import Path

from alembic.config import Config

from alembic import command

BACKEND = Path(__file__).resolve().parents[1]


def _config(url: str) -> Config:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.attributes["database_url"] = url
    cfg.attributes["configure_logger"] = False
    return cfg


def test_upgrade_check_downgrade(tmp_path: Path) -> None:
    cfg = _config(f"sqlite+aiosqlite:///{tmp_path / 'mig.db'}")
    command.upgrade(cfg, "head")
    command.check(cfg)  # raises if autogenerate would detect any difference
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
