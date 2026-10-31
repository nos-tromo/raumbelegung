from fastapi import APIRouter

from app.auth.users import auth_backend, fastapi_users
from app.schemas.user import UserCreate, UserRead

# Rate limits for these routes live in app/ratelimit.py (middleware).
router = APIRouter(prefix="/auth", tags=["auth"])
router.include_router(fastapi_users.get_auth_router(auth_backend))
router.include_router(fastapi_users.get_register_router(UserRead, UserCreate))  # type: ignore[type-var]
router.include_router(fastapi_users.get_verify_router(UserRead))  # type: ignore[type-var]
router.include_router(fastapi_users.get_reset_password_router())
