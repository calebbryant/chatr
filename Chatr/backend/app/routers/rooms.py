import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.message import Message, ReadReceipt
from app.models.room import Room, RoomMember
from app.models.user import User
from app.schemas.room import DMRoomRequest, RoomCreate, RoomResponse, RoomWithMembers
from app.schemas.user import UserResponse
from app.services.auth import get_current_user

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("/", response_model=list[RoomResponse])
async def list_rooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Room)
        .join(RoomMember, RoomMember.room_id == Room.id)
        .where(RoomMember.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("/", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    room_in: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check for duplicate name
    result = await db.execute(select(Room).where(Room.name == room_in.name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Room name already exists")

    room = Room(
        name=room_in.name,
        description=room_in.description,
        is_direct=room_in.is_direct,
        created_by=current_user.id,
    )
    db.add(room)
    await db.flush()

    # Add creator as member
    member = RoomMember(room_id=room.id, user_id=current_user.id)
    db.add(member)
    await db.flush()
    await db.refresh(room)
    return room


@router.get("/unread-counts", response_model=dict[str, int])
async def get_unread_counts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get all rooms user is in
    result = await db.execute(
        select(RoomMember.room_id).where(RoomMember.user_id == current_user.id)
    )
    room_ids = [row[0] for row in result.all()]

    if not room_ids:
        return {}

    counts = {}
    for room_id in room_ids:
        # Find the latest read receipt for this user in this room
        latest_read_query = (
            select(func.max(ReadReceipt.read_at))
            .join(Message, Message.id == ReadReceipt.message_id)
            .where(and_(
                ReadReceipt.user_id == current_user.id,
                Message.room_id == room_id,
            ))
        )
        result = await db.execute(latest_read_query)
        latest_read = result.scalar()

        # Count messages after that time (excluding user's own messages)
        unread_query = (
            select(func.count(Message.id))
            .where(and_(
                Message.room_id == room_id,
                Message.sender_id != current_user.id,
                Message.is_deleted == False,  # noqa: E712
            ))
        )
        if latest_read:
            unread_query = unread_query.where(Message.created_at > latest_read)

        result = await db.execute(unread_query)
        count = result.scalar() or 0
        if count > 0:
            counts[str(room_id)] = count

    return counts


@router.get("/{room_id}", response_model=RoomWithMembers)
async def get_room(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Room).options(selectinload(Room.members).selectinload(RoomMember.user)).where(Room.id == room_id)
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    # Check membership
    is_member = any(m.user_id == current_user.id for m in room.members)
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this room")

    return RoomWithMembers(
        id=room.id,
        name=room.name,
        description=room.description,
        is_direct=room.is_direct,
        created_by=room.created_by,
        created_at=room.created_at,
        members=[UserResponse.model_validate(m.user) for m in room.members],
    )


@router.post("/{room_id}/join", status_code=status.HTTP_200_OK)
async def join_room(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    # Check if already a member
    result = await db.execute(
        select(RoomMember).where(
            and_(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id)
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already a member")

    member = RoomMember(room_id=room_id, user_id=current_user.id)
    db.add(member)
    await db.flush()
    return {"detail": "Joined room successfully"}


@router.post("/{room_id}/leave", status_code=status.HTTP_200_OK)
async def leave_room(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RoomMember).where(
            and_(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id)
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=400, detail="Not a member of this room")

    await db.delete(member)
    await db.flush()
    return {"detail": "Left room successfully"}


@router.post("/dm", response_model=RoomResponse)
async def create_or_get_dm(
    dm_req: DMRoomRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    other_user_id = dm_req.other_user_id

    if other_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot DM yourself")

    # Check other user exists
    result = await db.execute(select(User).where(User.id == other_user_id))
    other_user = result.scalar_one_or_none()
    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Find existing DM room where both users are members
    result = await db.execute(
        select(Room)
        .join(RoomMember, RoomMember.room_id == Room.id)
        .where(
            and_(
                Room.is_direct == True,  # noqa: E712
                RoomMember.user_id == current_user.id,
            )
        )
    )
    candidate_rooms = result.scalars().all()

    for room in candidate_rooms:
        result = await db.execute(
            select(RoomMember).where(
                and_(RoomMember.room_id == room.id, RoomMember.user_id == other_user_id)
            )
        )
        if result.scalar_one_or_none():
            return room

    # Create new DM room
    dm_name = f"dm_{min(str(current_user.id), str(other_user_id))}_{max(str(current_user.id), str(other_user_id))}"
    room = Room(
        name=dm_name,
        is_direct=True,
        created_by=current_user.id,
    )
    db.add(room)
    await db.flush()

    db.add(RoomMember(room_id=room.id, user_id=current_user.id))
    db.add(RoomMember(room_id=room.id, user_id=other_user_id))
    await db.flush()
    await db.refresh(room)
    return room
