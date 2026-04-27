import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    username: str | None = None
    avatar_url: str | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    avatar_url: str | None = None
    is_online: bool = False
    auth_provider: str = "local"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
