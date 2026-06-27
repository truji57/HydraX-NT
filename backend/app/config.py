import os
import subprocess
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent


def get_version() -> str:
    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--abbrev=0"],
            capture_output=True, text=True, cwd=str(BASE_DIR.parent)
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().lstrip("v")
    except Exception:
        pass
    return "1.0.0"


class Settings(BaseSettings):
    APP_NAME: str = "HydraX-NT"
    DEBUG: bool = True
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'hydrax_nt.db'}"
    SECRET_KEY: str = "hydrax-nt-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"]
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 8005

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
