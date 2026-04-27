import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import UserResponse


class RoomCreate(BaseModel):
    name: str
    description: str | None = None
    is_direct: bool = False


class RoomMemberResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    room_id: uuid.UUID
    joined_at: datetime

    model_config = {"from_attributes": True}


class RoomResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    is_direct: bool = False
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class RoomWithMembers(RoomResponse):
    members: list[UserResponse] = []

    model_config = {"from_attributes": True}


class DMRoomRequest(BaseModel):
    other_user_id: uuid.UUID
