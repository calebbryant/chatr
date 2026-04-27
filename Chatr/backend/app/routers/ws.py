import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, select

from app.database import async_session_factory
from app.models.message import Message, ReadReceipt
from app.models.room import RoomMember
from app.models.user import User
from app.schemas.message import MessageResponse
from app.services.auth import get_current_user_ws
from app.services.websocket_manager import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: uuid.UUID, token: str = ""):
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    async with async_session_factory() as db:
        user = await get_current_user_ws(token, db)
        if not user:
            await websocket.close(code=4001, reason="Invalid token")
            return

        # Check membership
        result = await db.execute(
            select(RoomMember).where(
                and_(RoomMember.room_id == room_id, RoomMember.user_id == user.id)
            )
        )
        if not result.scalar_one_or_none():
            await websocket.close(code=4003, reason="Not a member of this room")
            return

        user_id = user.id
        username = user.username

    # Connect
    await manager.connect(websocket, user_id, room_id)

    # Set user online
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        db_user = result.scalar_one_or_none()
        if db_user:
            db_user.is_online = True
            await db.commit()

    # Broadcast user joined
    await manager.broadcast_to_room(
        room_id,
        {"type": "user_joined", "user_id": str(user_id), "username": username},
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")

            if msg_type == "message":
                content = data.get("content", "").strip()
                if not content:
                    continue

                async with async_session_factory() as db:
                    message = Message(
                        content=content,
                        room_id=room_id,
                        sender_id=user_id,
                        file_url=data.get("file_url"),
                        file_name=data.get("file_name"),
                    )
                    db.add(message)
                    await db.commit()
                    await db.refresh(message)

                    response = MessageResponse(
                        id=message.id,
                        content=message.content,
                        room_id=message.room_id,
                        sender_id=message.sender_id,
                        sender_username=username,
                        file_url=message.file_url,
                        file_name=message.file_name,
                        is_edited=message.is_edited,
                        is_deleted=message.is_deleted,
                        created_at=message.created_at,
                        updated_at=message.updated_at,
                    )

                await manager.broadcast_to_room(
                    room_id,
                    {"type": "message", "data": response.model_dump(mode="json")},
                )

            elif msg_type == "typing":
                is_typing = data.get("is_typing", True)
                await manager.send_typing_indicator(room_id, user_id, username, is_typing)

            elif msg_type == "read_receipt":
                message_id_str = data.get("message_id")
                if not message_id_str:
                    continue
                message_id = uuid.UUID(message_id_str)

                async with async_session_factory() as db:
                    # Check if receipt already exists
                    result = await db.execute(
                        select(ReadReceipt).where(
                            and_(
                                ReadReceipt.message_id == message_id,
                                ReadReceipt.user_id == user_id,
                            )
                        )
                    )
                    if not result.scalar_one_or_none():
                        receipt = ReadReceipt(
                            message_id=message_id,
                            user_id=user_id,
                            read_at=datetime.now(timezone.utc),
                        )
                        db.add(receipt)
                        await db.commit()
                        await db.refresh(receipt)

                await manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "read_receipt",
                        "message_id": str(message_id),
                        "user_id": str(user_id),
                        "username": username,
                    },
                )

            elif msg_type == "edit":
                message_id_str = data.get("message_id")
                new_content = data.get("content", "").strip()
                if not message_id_str or not new_content:
                    continue
                msg_id = uuid.UUID(message_id_str)
                async with async_session_factory() as db:
                    result = await db.execute(
                        select(Message).where(and_(Message.id == msg_id, Message.room_id == room_id, Message.sender_id == user_id))
                    )
                    msg = result.scalar_one_or_none()
                    if msg and not msg.is_deleted:
                        msg.content = new_content
                        msg.is_edited = True
                        await db.commit()
                        await db.refresh(msg)
                        response = MessageResponse(
                            id=msg.id, content=msg.content, room_id=msg.room_id,
                            sender_id=msg.sender_id, sender_username=username,
                            file_url=msg.file_url, file_name=msg.file_name,
                            is_edited=True, is_deleted=False,
                            created_at=msg.created_at, updated_at=msg.updated_at,
                        )
                        await manager.broadcast_to_room(room_id, {"type": "message_edited", "data": response.model_dump(mode="json")})

            elif msg_type == "delete":
                message_id_str = data.get("message_id")
                if not message_id_str:
                    continue
                msg_id = uuid.UUID(message_id_str)
                async with async_session_factory() as db:
                    result = await db.execute(
                        select(Message).where(and_(Message.id == msg_id, Message.room_id == room_id, Message.sender_id == user_id))
                    )
                    msg = result.scalar_one_or_none()
                    if msg:
                        msg.content = "[Message deleted]"
                        msg.is_deleted = True
                        msg.file_url = None
                        msg.file_name = None
                        await db.commit()
                        await manager.broadcast_to_room(room_id, {
                            "type": "message_deleted",
                            "data": {"message_id": str(msg_id), "room_id": str(room_id)},
                        })

            elif msg_type == "reaction":
                message_id_str = data.get("message_id")
                emoji = data.get("emoji", "")
                if not message_id_str or not emoji:
                    continue
                msg_id = uuid.UUID(message_id_str)
                async with async_session_factory() as db:
                    from app.models.message import Reaction
                    # Check if reaction exists (toggle)
                    result = await db.execute(
                        select(Reaction).where(and_(
                            Reaction.message_id == msg_id,
                            Reaction.user_id == user_id,
                            Reaction.emoji == emoji,
                        ))
                    )
                    existing = result.scalar_one_or_none()
                    if existing:
                        await db.delete(existing)
                        await db.commit()
                        await manager.broadcast_to_room(room_id, {
                            "type": "reaction_removed",
                            "data": {"message_id": str(msg_id), "user_id": str(user_id), "emoji": emoji},
                        })
                    else:
                        reaction = Reaction(message_id=msg_id, user_id=user_id, emoji=emoji)
                        db.add(reaction)
                        await db.commit()
                        await db.refresh(reaction)
                        await manager.broadcast_to_room(room_id, {
                            "type": "reaction_added",
                            "data": {
                                "id": str(reaction.id), "message_id": str(msg_id),
                                "user_id": str(user_id), "username": username,
                                "emoji": emoji, "created_at": str(reaction.created_at),
                            },
                        })

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, user_id, room_id)

        # Update online status
        async with async_session_factory() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            db_user = result.scalar_one_or_none()
            if db_user:
                db_user.is_online = False
                await db.commit()

        # Broadcast user left
        await manager.broadcast_to_room(
            room_id,
            {"type": "user_left", "user_id": str(user_id), "username": username},
        )
