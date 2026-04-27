import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.message import Message, ReadReceipt
from app.models.room import RoomMember
from app.models.user import User
from app.schemas.message import MessageCreate, MessageResponse, MessageUpdate, ReactionCreate, ReactionResponse, ReadReceiptResponse
from app.services.auth import get_current_user
from app.services.websocket_manager import manager

router = APIRouter(prefix="/rooms/{room_id}/messages", tags=["messages"])


async def _check_membership(room_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> None:
    result = await db.execute(
        select(RoomMember).where(
            and_(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this room")


def _build_message_response(message: Message, sender_username: str | None = None) -> MessageResponse:
    return MessageResponse(
        id=message.id, content=message.content, room_id=message.room_id,
        sender_id=message.sender_id, sender_username=sender_username or (message.sender.username if message.sender else None),
        file_url=message.file_url, file_name=message.file_name,
        is_edited=message.is_edited, is_deleted=message.is_deleted,
        reactions=[
            ReactionResponse(
                id=r.id, message_id=r.message_id, user_id=r.user_id,
                username=r.user.username if r.user else None,
                emoji=r.emoji, created_at=r.created_at,
            ) for r in (message.reactions or [])
        ],
        created_at=message.created_at, updated_at=message.updated_at,
    )


@router.get("/", response_model=list[MessageResponse])
async def get_messages(
    room_id: uuid.UUID,
    cursor: datetime | None = Query(None, description="Cursor for pagination (created_at of last message)"),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(room_id, current_user.id, db)

    query = (
        select(Message)
        .options(selectinload(Message.sender))
        .where(Message.room_id == room_id)
    )
    if cursor:
        query = query.where(Message.created_at < cursor)

    query = query.order_by(Message.created_at.desc()).limit(limit)
    result = await db.execute(query)
    messages = result.scalars().all()

    return [_build_message_response(m) for m in messages]


@router.post("/", response_model=MessageResponse, status_code=201)
async def send_message(
    room_id: uuid.UUID,
    msg_in: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(room_id, current_user.id, db)

    message = Message(
        content=msg_in.content,
        room_id=room_id,
        sender_id=current_user.id,
        file_url=msg_in.file_url,
        file_name=msg_in.file_name,
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)

    response = _build_message_response(message, sender_username=current_user.username)

    # Broadcast via WebSocket
    await manager.broadcast_to_room(
        room_id,
        {"type": "message", "data": response.model_dump(mode="json")},
    )

    return response


@router.post("/{message_id}/read", response_model=ReadReceiptResponse, status_code=201)
async def mark_as_read(
    room_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(room_id, current_user.id, db)

    # Check message exists in room
    result = await db.execute(
        select(Message).where(and_(Message.id == message_id, Message.room_id == room_id))
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Message not found")

    # Check existing receipt
    result = await db.execute(
        select(ReadReceipt).where(
            and_(ReadReceipt.message_id == message_id, ReadReceipt.user_id == current_user.id)
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    receipt = ReadReceipt(
        message_id=message_id,
        user_id=current_user.id,
        read_at=datetime.now(timezone.utc),
    )
    db.add(receipt)
    await db.flush()
    await db.refresh(receipt)
    return receipt


@router.put("/{message_id}", response_model=MessageResponse)
async def edit_message(
    room_id: uuid.UUID,
    message_id: uuid.UUID,
    msg_in: MessageUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(room_id, current_user.id, db)
    result = await db.execute(
        select(Message).where(and_(Message.id == message_id, Message.room_id == room_id))
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only edit your own messages")
    if message.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot edit a deleted message")

    message.content = msg_in.content
    message.is_edited = True
    await db.flush()
    await db.refresh(message)

    response = MessageResponse(
        id=message.id, content=message.content, room_id=message.room_id,
        sender_id=message.sender_id, sender_username=current_user.username,
        file_url=message.file_url, file_name=message.file_name,
        is_edited=message.is_edited, is_deleted=message.is_deleted,
        created_at=message.created_at, updated_at=message.updated_at,
    )
    await manager.broadcast_to_room(room_id, {"type": "message_edited", "data": response.model_dump(mode="json")})
    return response


@router.delete("/{message_id}", status_code=200)
async def delete_message(
    room_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(room_id, current_user.id, db)
    result = await db.execute(
        select(Message).where(and_(Message.id == message_id, Message.room_id == room_id))
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only delete your own messages")

    message.content = "[Message deleted]"
    message.is_deleted = True
    message.file_url = None
    message.file_name = None
    await db.flush()

    await manager.broadcast_to_room(room_id, {
        "type": "message_deleted",
        "data": {"message_id": str(message_id), "room_id": str(room_id)},
    })
    return {"detail": "Message deleted"}


@router.post("/{message_id}/reactions", status_code=201)
async def add_reaction(
    room_id: uuid.UUID,
    message_id: uuid.UUID,
    reaction_in: ReactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.message import Reaction
    await _check_membership(room_id, current_user.id, db)

    # Check message exists
    result = await db.execute(select(Message).where(and_(Message.id == message_id, Message.room_id == room_id)))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Message not found")

    # Check for existing reaction
    result = await db.execute(
        select(Reaction).where(and_(
            Reaction.message_id == message_id,
            Reaction.user_id == current_user.id,
            Reaction.emoji == reaction_in.emoji,
        ))
    )
    existing = result.scalar_one_or_none()
    if existing:
        # Toggle off - remove it
        await db.delete(existing)
        await db.flush()
        await manager.broadcast_to_room(room_id, {
            "type": "reaction_removed",
            "data": {"message_id": str(message_id), "user_id": str(current_user.id), "emoji": reaction_in.emoji},
        })
        return {"detail": "Reaction removed"}

    reaction = Reaction(message_id=message_id, user_id=current_user.id, emoji=reaction_in.emoji)
    db.add(reaction)
    await db.flush()
    await db.refresh(reaction)

    response = ReactionResponse(
        id=reaction.id, message_id=reaction.message_id, user_id=reaction.user_id,
        username=current_user.username, emoji=reaction.emoji, created_at=reaction.created_at,
    )
    await manager.broadcast_to_room(room_id, {"type": "reaction_added", "data": response.model_dump(mode="json")})
    return response
