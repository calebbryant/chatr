import uuid
from datetime import datetime

from pydantic import BaseModel


class MessageCreate(BaseModel):
    content: str
    file_url: str | None = None
    file_name: str | None = None


class MessageUpdate(BaseModel):
    content: str


class ReactionResponse(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    user_id: uuid.UUID
    username: str | None = None
    emoji: str
    created_at: datetime
    model_config = {"from_attributes": True}


class ReactionCreate(BaseModel):
    emoji: str


class MessageResponse(BaseModel):
    id: uuid.UUID
    content: str
    room_id: uuid.UUID
    sender_id: uuid.UUID
    sender_username: str | None = None
    file_url: str | None = None
    file_name: str | None = None
    is_edited: bool = False
    is_deleted: bool = False
    reactions: list[ReactionResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReadReceiptResponse(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    user_id: uuid.UUID
    read_at: datetime

    model_config = {"from_attributes": True}
