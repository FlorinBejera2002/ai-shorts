"""Upload-Post API integration — Phase 2"""

import logging
import os
import httpx

logger = logging.getLogger(__name__)

UPLOAD_POST_API_URL = "https://api.upload-post.com/api/upload"


def post_to_social(
    video_path: str,
    api_key: str,
    user_id: str,
    platforms: list[str],
    title: str = "Viral Short",
    description: str = "",
    scheduled_date: str | None = None,
    timezone: str = "UTC",
    tiktok_title: str | None = None,
    instagram_title: str | None = None,
    youtube_title: str | None = None,
    youtube_description: str | None = None,
) -> dict:
    """Post video to social platforms via Upload-Post API.

    Args:
        video_path: Path to video file
        api_key: Upload-Post API key
        user_id: Upload-Post user ID
        platforms: List of platform names (e.g. ["tiktok", "instagram", "youtube"])
        title: Default title for all platforms
        description: Default description
        scheduled_date: ISO format date for scheduling (e.g. "2024-01-15T14:30:00")
        timezone: Timezone for scheduling (e.g. "America/New_York")
        tiktok_title: Custom TikTok title
        instagram_title: Custom Instagram title
        youtube_title: Custom YouTube title
        youtube_description: Custom YouTube description

    Returns:
        Response dict with status, message, and upload_id
    """
    try:
        # Validate file
        if not os.path.exists(video_path):
            logger.error(f"Video file not found: {video_path}")
            return {
                "status": "error",
                "message": "Video file not found",
                "upload_id": None,
            }

        # Read video file
        with open(video_path, "rb") as f:
            video_content = f.read()

        filename = os.path.basename(video_path)

        # Build data payload
        data_payload = {
            "api_key": api_key,
            "user_id": user_id,
            "title": title,
            "description": description,
            "platform": platforms,  # Pass list directly
            "async_upload": "true",
        }

        # Add platform-specific titles
        if tiktok_title and "tiktok" in platforms:
            data_payload["tiktok_title"] = tiktok_title

        if instagram_title and "instagram" in platforms:
            data_payload["instagram_title"] = instagram_title
            data_payload["media_type"] = "REELS"

        if youtube_title and "youtube" in platforms:
            data_payload["youtube_title"] = youtube_title

        if youtube_description and "youtube" in platforms:
            data_payload["youtube_description"] = youtube_description
            data_payload["privacyStatus"] = "public"

        # Add scheduling if provided
        if scheduled_date:
            data_payload["scheduled_date"] = scheduled_date
            data_payload["timezone"] = timezone

        # Upload via multipart form
        files = {
            "video": (filename, video_content, "video/mp4"),
        }

        logger.info(
            f"Posting to {', '.join(platforms)} via Upload-Post API"
        )

        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                UPLOAD_POST_API_URL,
                data=data_payload,
                files=files,
            )

        if response.status_code not in [200, 201, 202]:
            logger.error(
                f"Upload-Post API error: {response.status_code} - {response.text}"
            )
            return {
                "status": "error",
                "message": f"API error: {response.status_code}",
                "upload_id": None,
            }

        result = response.json()
        logger.info(f"Posted successfully: {result}")

        return {
            "status": "success",
            "message": "Video posted to social platforms",
            "upload_id": result.get("upload_id"),
            "response": result,
        }

    except Exception as e:
        logger.error(f"Error posting to social: {e}")
        return {
            "status": "error",
            "message": str(e),
            "upload_id": None,
        }


def get_social_user(api_key: str) -> dict | None:
    """Fetch user info from Upload-Post API.

    Args:
        api_key: Upload-Post API key

    Returns:
        User info dict or None on failure
    """
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(
                f"{UPLOAD_POST_API_URL.rsplit('/', 1)[0]}/user",
                headers={"Authorization": f"Bearer {api_key}"},
            )

        if response.status_code != 200:
            logger.error(f"Failed to fetch user info: {response.status_code}")
            return None

        return response.json()

    except Exception as e:
        logger.error(f"Error fetching user info: {e}")
        return None
