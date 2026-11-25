import os


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://porshi:porshi@localhost:5432/porshi")
    secret_key: str = os.getenv("SECRET_KEY", "dev-only-secret-change-me-in-production-0123456789")
    token_hours: int = int(os.getenv("TOKEN_HOURS", "12"))
    upload_dir: str = os.getenv("UPLOAD_DIR", "./uploads")
    # When true, OTP codes are returned in the API response so the demo works without an SMS gateway.
    demo_mode: bool = os.getenv("DEMO_MODE", "true").lower() == "true"
    seed_on_start: bool = os.getenv("SEED_ON_START", "true").lower() == "true"
    cors_origins: list[str] = [o for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o]
    sms_provider: str = os.getenv("SMS_PROVIDER", "console")  # console | http
    sms_api_url: str = os.getenv("SMS_API_URL", "")
    sms_api_key: str = os.getenv("SMS_API_KEY", "")
    sms_sender: str = os.getenv("SMS_SENDER", "PORSHI")


settings = Settings()
