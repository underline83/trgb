import os
from datetime import timedelta

SECRET_KEY = os.getenv("SECRET_KEY", "trgb_secret_key_2025")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
