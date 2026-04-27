import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.config import settings
from app.models.user import User
from app.services.auth import get_current_user

router = APIRouter(prefix="/upload", tags=["files"])


@router.post("/")
async def upload_file(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
):
    # Validate file size
    contents = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    # Generate unique filename
    ext = os.path.splitext(file.filename or "file")[1]
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)

    # Save file
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(contents)

    file_url = f"/uploads/{unique_name}"
    return {
        "file_url": file_url,
        "file_name": file.filename,
        "size": len(contents),
    }
