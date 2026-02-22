"""
Application settings with validation using pydantic-settings.
Validates all required environment variables at startup.
"""
import os
import socket
from urllib.parse import quote_plus
from typing import Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _resolve_db_host(host: str) -> str:
    """Resolve DB host to IP so asyncpg avoids getaddrinfo in asyncio context (e.g. in Docker)."""
    if not host or host in ("localhost", "127.0.0.1"):
        return host
    try:
        return socket.gethostbyname(host)
    except socket.gaierror:
        return host


class Settings(BaseSettings):
    """Application settings with validation."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    
    # Bot configuration
    BOT_TOKEN: str = Field(..., description="Telegram bot token")
    
    # Database configuration
    DB_USER: str = Field(..., description="PostgreSQL username")
    DB_PASSWORD: str = Field(..., description="PostgreSQL password")
    DB_NAME: str = Field(..., description="PostgreSQL database name")
    DB_HOST: str = Field(default="localhost", description="PostgreSQL host")
    DB_PORT: str = Field(default="5432", description="PostgreSQL port")
    DB_READ_REPLICA_URL: Optional[str] = Field(default=None, description="PostgreSQL read replica URL (optional)")
    
    # Redis configuration
    REDIS_HOST: str = Field(default="localhost", description="Redis host")
    REDIS_PORT: int = Field(default=6379, description="Redis port")
    REDIS_DB: int = Field(default=0, description="Redis database number")
    
    # Security configuration
    ADMIN_LOGIN: Optional[str] = Field(default=None, description="Admin login (required in production)")
    ADMIN_PASSWORD: Optional[str] = Field(default=None, description="Admin password (required in production)")
    ADMIN_SECRET: Optional[str] = Field(default=None, description="Admin secret token (required in production)")
    JWT_SECRET: Optional[str] = Field(default=None, description="JWT secret for seller tokens (required in production)")
    
    # CORS configuration
    ALLOWED_ORIGINS: str = Field(default="", description="Comma-separated list of allowed CORS origins")
    
    # Environment
    ENVIRONMENT: str = Field(default="production", description="Environment: development or production")
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")
    
    # Application configuration
    BOT_USERNAME: Optional[str] = Field(default=None, description="Telegram bot username")
    MASTER_ADMIN_ID: Optional[int] = Field(default=None, description="Master admin Telegram ID")
    
    # DaData API configuration
    DADATA_API_KEY: Optional[str] = Field(default=None, description="DaData API key for INN validation")

    # YuKassa payment configuration (split payments for marketplace)
    YOOKASSA_SHOP_ID: Optional[str] = Field(default=None, description="YuKassa marketplace shop ID")
    YOOKASSA_SECRET_KEY: Optional[str] = Field(default=None, description="YuKassa secret key")
    YOOKASSA_RETURN_URL: Optional[str] = Field(default=None, description="URL to return to after YuKassa payment (miniapp)")

    # Subscription configuration
    SUBSCRIPTION_BASE_PRICE: int = Field(default=990, description="Base monthly subscription price in rubles")

    # Database pool configuration
    DB_POOL_SIZE: int = Field(default=50, description="Database connection pool size")
    DB_MAX_OVERFLOW: int = Field(default=100, description="Database max overflow connections")
    DB_POOL_RECYCLE: int = Field(default=3600, description="Database connection recycle time (seconds)")
    
    # Bot pool configuration
    BOT_POOL_SIZE: int = Field(default=10, description="Bot database connection pool size")
    BOT_MAX_OVERFLOW: int = Field(default=20, description="Bot database max overflow connections")
    
    @field_validator("ENVIRONMENT")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        """Validate environment value."""
        if v not in ("development", "production"):
            raise ValueError("ENVIRONMENT must be 'development' or 'production'")
        return v
    
    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Validate log level."""
        valid_levels = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
        if v.upper() not in valid_levels:
            raise ValueError(f"LOG_LEVEL must be one of {valid_levels}")
        return v.upper()
    
    def validate_production_settings(self) -> list[str]:
        """
        Validate that all required settings are present in production.
        Returns list of missing settings.
        """
        errors = []
        
        if self.ENVIRONMENT == "production":
            if not self.ADMIN_LOGIN:
                errors.append("ADMIN_LOGIN is required in production")
            if not self.ADMIN_PASSWORD:
                errors.append("ADMIN_PASSWORD is required in production")
            if not self.ADMIN_SECRET:
                errors.append("ADMIN_SECRET is required in production")
            if not self.JWT_SECRET:
                errors.append("JWT_SECRET is required in production")
            if not self.ALLOWED_ORIGINS:
                errors.append("ALLOWED_ORIGINS is required in production")
        
        return errors
    
    @property
    def db_url(self) -> str:
        """Get database URL. Resolve host to IP so connections work in Docker/async context."""
        host = _resolve_db_host(self.DB_HOST)
        password = quote_plus(self.DB_PASSWORD)
        return f"postgresql+asyncpg://{self.DB_USER}:{password}@{host}:{self.DB_PORT}/{self.DB_NAME}"
    
    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.ENVIRONMENT == "production"
    
    @property
    def allowed_origins_list(self) -> list[str]:
        """Get list of allowed CORS origins."""
        if not self.ALLOWED_ORIGINS:
            return []
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


# Global settings instance
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get application settings (singleton)."""
    global _settings
    if _settings is None:
        _settings = Settings()
        # Validate production settings
        errors = _settings.validate_production_settings()
        if errors:
            error_msg = "Configuration errors:\n" + "\n".join(f"  - {e}" for e in errors)
            raise ValueError(error_msg)
    return _settings
