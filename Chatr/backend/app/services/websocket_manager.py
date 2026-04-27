import json
import uuid
from dataclasses import dataclass, field

from fastapi import WebSocket


@dataclass
class ConnectionManager:
    """Manages WebSocket connections grouped by room."""

    _rooms: dict[uuid.UUID, set[tuple[WebSocket, uuid.UUID]]] = field(default_factory=dict)

    async def connect(self, websocket: WebSocket, user_id: uuid.UUID, room_id: uuid.UUID) -> None:
        await websocket.accept()
        if room_id not in self._rooms:
            self._rooms[room_id] = set()
        self._rooms[room_id].add((websocket, user_id))

    def disconnect(self, websocket: WebSocket, user_id: uuid.UUID, room_id: uuid.UUID) -> None:
        if room_id in self._rooms:
            self._rooms[room_id].discard((websocket, user_id))
            if not self._rooms[room_id]:
                del self._rooms[room_id]

    async def broadcast_to_room(self, room_id: uuid.UUID, message_data: dict) -> None:
        connections = self._rooms.get(room_id, set())
        payload = json.dumps(message_data, default=str)
        disconnected = []
        for ws, uid in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                disconnected.append((ws, uid))
        for item in disconnected:
            connections.discard(item)

    async def send_typing_indicator(
        self,
        room_id: uuid.UUID,
        user_id: uuid.UUID,
        username: str,
        is_typing: bool,
    ) -> None:
        await self.broadcast_to_room(
            room_id,
            {
                "type": "typing",
                "user_id": str(user_id),
                "username": username,
                "is_typing": is_typing,
            },
        )


manager = ConnectionManager()
