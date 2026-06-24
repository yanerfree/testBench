from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 数据库
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/testbench"
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # 安全
    secret_key: str = "change-me-in-production"
    jwt_expire_hours: int = 8
    bcrypt_cost: int = 12  # >= 10

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # Admin seed
    admin_default_password: str = "admin123"

    # AI / LLM
    ai_provider: str = "openai_compatible"  # openai_compatible | anthropic
    ai_base_url: str = ""
    ai_api_key: str = ""
    ai_auth_token: str = ""
    ai_model: str = "claude-sonnet-4-6"
    ai_max_tokens: int = 4096
    ai_temperature: float = 0.3
    ai_timeout_seconds: int = 120
    ai_enabled: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
