import os

# app.config.Settings() is instantiated at import time and requires these — set
# dummy values before any `app.*` module is imported so tests don't need a real
# .env or a live database. Tests in this suite only cover DB-free modules
# (security, constants, pdf, claude_client) precisely to avoid needing Postgres.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("VOYAGE_API_KEY", "test-voyage-key")
