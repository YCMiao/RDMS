from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    app_timezone: str = "Asia/Shanghai"
    upload_root: Path = Path("/data/uploads")
    max_upload_bytes: int = Field(default=104_857_600, gt=0)
    log_level: str = "INFO"
    cas_common_chemistry_api_key: str | None = None

    @field_validator("app_timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("APP_TIMEZONE must be a valid IANA timezone") from exc
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
