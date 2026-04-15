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

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # Admin seed
    admin_default_password: str = "admin123"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
