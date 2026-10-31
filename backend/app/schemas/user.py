import uuid
from typing import Annotated

from fastapi_users import schemas
from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints, field_validator

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    is_verified: bool


class UserCreate(schemas.BaseUserCreate):
    display_name: DisplayName

    @field_validator("email", mode="after")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class UserUpdate(BaseModel):
    display_name: DisplayName


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class AccountDelete(BaseModel):
    password: str


class EmailIn(BaseModel):
    email: EmailStr
