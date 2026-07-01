"""
Smart crop service: YOLOv8 + MediaPipe face tracking vertical reframing engine.
Extracted from OpenShorts with modifications for Celery integration and logging.
"""

import cv2
import numpy as np
import subprocess
import logging
import tempfile
import os
from typing import Callable, Optional, List, Tuple, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)

# Constants
ASPECT_RATIO = 9 / 16

# Lazy-loaded models
_yolo_model = None


def _get_yolo_model():
    """Lazily load YOLO model on first use."""
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO
        _yolo_model = YOLO('yolov8n.pt')
        logger.info("YOLO model loaded")
    return _yolo_model


class SmoothedCameraman:
    """
    Smooth camera tracking following face bounding boxes.
    Snaps to target when face is outside safe zone, otherwise moves smoothly.
    """

    def __init__(self, output_width: int, output_height: int, video_width: int, video_height: int):
        """
        Initialize cameraman with crop dimensions calculated from aspect ratio.

        Args:
            output_width: Target output width (9)
            output_height: Target output height (16)
            video_width: Source video width
            video_height: Source video height
        """
        self.output_width = output_width
        self.output_height = output_height
        self.video_width = video_width
        self.video_height = video_height

        # Calculate crop dimensions to maintain aspect ratio
        self.crop_height = video_height
        self.crop_width = int(self.crop_height * ASPECT_RATIO)

        # Clamp crop_width to video width
        if self.crop_width > video_width:
            self.crop_width = video_width
            self.crop_height = int(self.crop_width / ASPECT_RATIO)

        self.safe_zone_radius = self.crop_width * 0.25
        self.target_center_x = self.video_width // 2
        self.current_center_x = self.video_width // 2

        logger.info(f"SmoothedCameraman initialized: crop_width={self.crop_width}, "
                   f"crop_height={self.crop_height}, safe_zone_radius={self.safe_zone_radius}")

    def update_target(self, face_box: Optional[List[float]]) -> None:
        """
        Update target center from face bounding box.

        Args:
            face_box: [x, y, w, h] or None
        """
        if face_box is not None:
            x, y, w, h = face_box
            self.target_center_x = int(x + w / 2)

    def get_crop_box(self, force_snap: bool = False) -> Tuple[int, int, int, int]:
        """
        Calculate crop box with smooth or snapped motion.

        Args:
            force_snap: If True, snap to target immediately (scene change)

        Returns:
            (x1, y1, x2, y2) crop coordinates
        """
        if force_snap:
            self.current_center_x = self.target_center_x
        else:
            # Check if target is outside safe zone
            distance = abs(self.target_center_x - self.current_center_x)
            if distance > self.safe_zone_radius:
                # Speed: 3.0 px/frame normal, 15.0 for large distance
                if distance > self.crop_width * 0.5:
                    speed = 15.0
                else:
                    speed = 3.0

                # Move toward target
                if self.target_center_x > self.current_center_x:
                    self.current_center_x += speed
                else:
                    self.current_center_x -= speed

                # Clamp to valid range
                half_crop = self.crop_width // 2
                self.current_center_x = max(half_crop, min(self.current_center_x, self.video_width - half_crop))

        # Calculate box coordinates
        half_crop = self.crop_width // 2
        x1 = max(0, self.current_center_x - half_crop)
        x2 = min(self.video_width, x1 + self.crop_width)

        # Recalc x1 if x2 hit boundary
        if x2 == self.video_width:
            x1 = max(0, x2 - self.crop_width)

        # Vertical: center crop
        y1 = (self.video_height - self.crop_height) // 2
        y2 = y1 + self.crop_height

        return int(x1), int(y1), int(x2), int(y2)


class SpeakerTracker:
    """
    Track faces across frames and identify active speaker.
    Uses distance-based matching and hysteresis bonus for stability.
    """

    def __init__(self, stabilization_frames: int = 15, cooldown_frames: int = 30):
        """
        Initialize speaker tracker.

        Args:
            stabilization_frames: Frames to wait before switching speaker
            cooldown_frames: Frames to wait after last update to reset speaker
        """
        self.stabilization_frames = stabilization_frames
        self.cooldown_frames = cooldown_frames
        self.speaker_scores: Dict[int, float] = {}
        self.known_faces: Dict[int, Tuple[float, float, int]] = {}  # id -> (x, y, last_frame)
        self.active_speaker_id: Optional[int] = None
        self.active_speaker_frame = 0
        self.next_face_id = 0

    def get_target(self, face_candidates: List[Dict[str, Any]], frame_number: int, width: int) -> Optional[List[float]]:
        """
        Match faces to known IDs, update scores, and return target face box.

        Args:
            face_candidates: List of {'box': [x,y,w,h], 'score': area}
            frame_number: Current frame number
            width: Video width for distance threshold

        Returns:
            Best face box [x, y, w, h] or None
        """
        matching_radius = width * 0.15
        decay_factor = 0.85
        hysteresis_bonus = 3.0

        # Remove stale known faces (30-frame memory)
        to_remove = [fid for fid, (_, _, last_f) in self.known_faces.items()
                     if frame_number - last_f > self.cooldown_frames]
        for fid in to_remove:
            del self.known_faces[fid]
            if fid in self.speaker_scores:
                del self.speaker_scores[fid]
            logger.debug(f"Removed stale face {fid}")

        # Decay all scores
        for fid in self.speaker_scores:
            self.speaker_scores[fid] *= decay_factor

        # Match candidates to known faces
        matched_ids = set()
        for candidate in face_candidates:
            cx, cy, cw, ch = candidate['box']
            center_x = cx + cw / 2
            center_y = cy + ch / 2

            best_id = None
            best_dist = matching_radius
            for fid, (kx, ky, _) in self.known_faces.items():
                dist = np.sqrt((center_x - kx) ** 2 + (center_y - ky) ** 2)
                if dist < best_dist:
                    best_dist = dist
                    best_id = fid

            if best_id is None:
                # New face
                best_id = self.next_face_id
                self.next_face_id += 1

            matched_ids.add(best_id)
            self.known_faces[best_id] = (center_x, center_y, frame_number)

            # Update score
            if best_id not in self.speaker_scores:
                self.speaker_scores[best_id] = 0.0
            score_delta = candidate['score'] / (width * 0.15) ** 2
            self.speaker_scores[best_id] += score_delta

        # Apply hysteresis bonus to active speaker
        if self.active_speaker_id is not None and self.active_speaker_id in self.speaker_scores:
            self.speaker_scores[self.active_speaker_id] *= hysteresis_bonus

        # Find best face
        if self.speaker_scores:
            best_face_id = max(self.speaker_scores, key=self.speaker_scores.get)
            now_active = (frame_number - self.active_speaker_frame >= self.stabilization_frames)

            if best_face_id != self.active_speaker_id and now_active:
                self.active_speaker_id = best_face_id
                self.active_speaker_frame = frame_number
                logger.debug(f"Switched to speaker {best_face_id}")

            if self.active_speaker_id in self.known_faces:
                x, y, _ = self.known_faces[self.active_speaker_id]
                # Reconstruct box from center
                face_data = [c for c in face_candidates
                             if abs((c['box'][0] + c['box'][2]/2) - x) < width * 0.1]
                if face_data:
                    return face_data[0]['box']

        return None


def detect_face_candidates(frame: np.ndarray) -> List[Dict[str, Any]]:
    """
    Detect faces in frame using MediaPipe.

    Args:
        frame: BGR image

    Returns:
        List of {'box': [x,y,w,h], 'score': area}
    """
    h, w = frame.shape[:2]
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    candidates = []

    try:
        import mediapipe as mp
        face_detection = mp.solutions.face_detection.FaceDetection(
            model_selection=1,
            min_detection_confidence=0.5,
        )
        results = face_detection.process(rgb_frame)
        if results.detections:
            for detection in results.detections:
                bbox = detection.location_data.relative_bounding_box
                x = int(bbox.xmin * w)
                y = int(bbox.ymin * h)
                box_w = int(bbox.width * w)
                box_h = int(bbox.height * h)
                x = max(0, min(x, w - 1))
                y = max(0, min(y, h - 1))
                box_w = min(box_w, w - x)
                box_h = min(box_h, h - y)
                area = box_w * box_h
                candidates.append({'box': [x, y, box_w, box_h], 'score': area})
        face_detection.close()
    except Exception:
        yolo_result = detect_person_yolo(frame)
        if yolo_result:
            x, y, bw, bh = [int(v) for v in yolo_result]
            candidates.append({'box': [x, y, bw, bh], 'score': bw * bh})

    return candidates


def detect_person_yolo(frame: np.ndarray) -> Optional[List[float]]:
    """
    Detect largest person in frame using YOLO.

    Args:
        frame: BGR image

    Returns:
        [x, y, w, face_h] where face_h = person_height * 0.4, or None
    """
    yolo = _get_yolo_model()
    results = yolo(frame, classes=[0], verbose=False)

    largest = None
    largest_area = 0

    if results and len(results) > 0:
        boxes = results[0].boxes
        for box in boxes:
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            w = x2 - x1
            h = y2 - y1
            area = w * h
            if area > largest_area:
                largest_area = area
                # Face is top 40% of person
                face_h = int(h * 0.4)
                largest = [int(x1), int(y1), int(w), face_h]

    return largest


def create_general_frame(frame: np.ndarray, output_width: int, output_height: int) -> np.ndarray:
    """
    Create general frame: blurred background + scaled foreground.

    Args:
        frame: Input BGR image
        output_width: Output width (9)
        output_height: Output height (16)

    Returns:
        Vertical frame with blurred background
    """
    h, w = frame.shape[:2]
    aspect = output_width / output_height

    # Background: resize to fill height, crop center, blur
    bg_scale = output_height / h
    bg_w = int(w * bg_scale)
    bg_h = output_height
    background = cv2.resize(frame, (bg_w, bg_h))

    if bg_w > output_width:
        start_x = (bg_w - output_width) // 2
        background = background[:, start_x:start_x + output_width]
    else:
        pad = output_width - bg_w
        background = cv2.copyMakeBorder(background, 0, 0, pad // 2, pad - pad // 2, cv2.BORDER_REPLICATE)

    background = cv2.GaussianBlur(background, (51, 51), 0)

    # Foreground: resize to fit width
    fg_scale = output_width / w
    fg_w = output_width
    fg_h = int(h * fg_scale)
    foreground = cv2.resize(frame, (fg_w, fg_h))

    # Overlay centered vertically
    output = background.copy()
    if fg_h <= output_height:
        y_start = (output_height - fg_h) // 2
        output[y_start:y_start + fg_h, :] = foreground
    else:
        y_start = (fg_h - output_height) // 2
        output[:, :] = foreground[y_start:y_start + output_height, :]

    return output


def detect_scenes(video_path: str) -> Tuple[List[Dict[str, Any]], float]:
    """
    Detect scene boundaries using scenedetect.

    Args:
        video_path: Path to video file

    Returns:
        (scene_list, fps) where scene_list is list of {'get_seconds': float}
    """
    from scenedetect import detect, ContentDetector

    scenes = detect(video_path, ContentDetector())
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()

    return scenes, fps


def _scene_start_seconds(scene: Any) -> float:
    if hasattr(scene, "get_seconds"):
        return float(scene.get_seconds())
    if isinstance(scene, (tuple, list)) and scene:
        first = scene[0]
        if hasattr(first, "get_seconds"):
            return float(first.get_seconds())
    if isinstance(scene, dict):
        value = scene.get("start") or scene.get("start_seconds") or 0
        if hasattr(value, "get_seconds"):
            return float(value.get_seconds())
        return float(value)
    return 0.0


def analyze_scenes_strategy(video_path: str, scenes: List[Dict[str, Any]]) -> List[str]:
    """
    Classify each scene as TRACK or GENERAL based on face count.

    Args:
        video_path: Path to video file
        scenes: List of scene objects with get_seconds()

    Returns:
        List of 'TRACK' or 'GENERAL' for each scene
    """
    cap = cv2.VideoCapture(video_path)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        strategies = []

        for i, scene in enumerate(scenes):
            start_sec = _scene_start_seconds(scene)
            if i + 1 < len(scenes):
                end_sec = _scene_start_seconds(scenes[i + 1])
            else:
                end_sec = frame_count / fps

            sample_frames = [
                int(start_sec * fps),
                int((start_sec + end_sec) / 2 * fps),
                int(end_sec * fps)
            ]

            total_faces = 0
            for frame_idx in sample_frames:
                frame_idx = max(0, min(frame_idx, frame_count - 1))
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()
                if not ret:
                    continue

                candidates = detect_face_candidates(frame)
                total_faces += len(candidates)

            avg_faces = total_faces / 3
            strategy = 'GENERAL' if (avg_faces > 1.2 or avg_faces < 0.5) else 'TRACK'
            strategies.append(strategy)
            logger.debug(f"Scene {i}: avg_faces={avg_faces:.2f} -> {strategy}")

        return strategies
    finally:
        cap.release()


def process_video_to_vertical(
    input_video: str,
    output_video: str,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    output_width: int = 1080,
    output_height: int = 1920,
) -> bool:
    """
    Process video to vertical format with smart cropping.

    Args:
        input_video: Path to input video
        output_video: Path to output video
        progress_callback: Function called with (current_frame, total_frames)

    Returns:
        True if successful
    """
    logger.info(f"Starting vertical reframing: {input_video} -> {output_video}")

    cap = cv2.VideoCapture(input_video)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        logger.info(f"Input: {video_width}x{video_height} @ {fps} fps, {frame_count} frames")

        logger.info("Detecting scenes...")
        scenes, _ = detect_scenes(input_video)
        logger.info(f"Found {len(scenes)} scenes")

        logger.info("Analyzing strategies...")
        strategies = analyze_scenes_strategy(input_video, scenes)

        cameraman = SmoothedCameraman(output_width, output_height, video_width, video_height)
        speaker_tracker = SpeakerTracker()

        scene_frames = [int(_scene_start_seconds(s) * fps) for s in scenes]
        scene_idx = 0

        logger.info("Processing frames...")
        with tempfile.TemporaryDirectory() as tmpdir:
            raw_video_path = os.path.join(tmpdir, 'raw.raw')
            audio_path = os.path.join(tmpdir, 'audio.aac')

            with open(raw_video_path, 'wb') as raw_file:
                frame_num = 0
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break

                    current_strategy = 'TRACK'
                    if scene_idx < len(strategies):
                        current_strategy = strategies[scene_idx]
                        if scene_idx + 1 < len(scene_frames) and frame_num >= scene_frames[scene_idx + 1]:
                            scene_idx += 1
                            force_snap = True
                        else:
                            force_snap = False
                    else:
                        force_snap = False

                    if current_strategy == 'GENERAL':
                        output_frame = create_general_frame(frame, output_width, output_height)
                    else:
                        force_snap = (scene_idx + 1 < len(scene_frames) and
                                     frame_num >= scene_frames[scene_idx + 1])

                        if frame_num % 2 == 0:
                            candidates = detect_face_candidates(frame)
                            target_box = speaker_tracker.get_target(candidates, frame_num, video_width)
                            cameraman.update_target(target_box)

                        x1, y1, x2, y2 = cameraman.get_crop_box(force_snap=force_snap)
                        cropped = frame[y1:y2, x1:x2]
                        output_frame = cv2.resize(cropped, (output_width, output_height))

                    raw_file.write(output_frame.tobytes())

                    frame_num += 1
                    if progress_callback:
                        progress_callback(frame_num, frame_count)

            cap.release()
            cap = None

            logger.info("Extracting audio...")
            subprocess.run(
                ['ffmpeg', '-i', input_video, '-vn', '-acodec', 'aac', '-y', audio_path],
                check=True, capture_output=True, timeout=600,
            )

            logger.info("Encoding video...")
            subprocess.run(
                [
                    'ffmpeg', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
                    '-s', f'{output_width}x{output_height}', '-r', str(fps),
                    '-i', raw_video_path, '-c:v', 'libx264', '-crf', '23',
                    '-preset', 'fast', '-y', output_video,
                ],
                check=True, capture_output=True, timeout=600,
            )

            logger.info("Merging audio...")
            temp_output = output_video + '.tmp.mp4'
            subprocess.run(
                [
                    'ffmpeg', '-i', output_video, '-i', audio_path,
                    '-c:v', 'copy', '-c:a', 'aac',
                    '-map', '0:v:0', '-map', '1:a:0', '-y', temp_output,
                ],
                check=True, capture_output=True, timeout=600,
            )
            os.replace(temp_output, output_video)

        logger.info(f"Vertical reframing complete: {output_video}")
        return True

    except Exception as e:
        logger.error(f"Error processing video: {e}", exc_info=True)
        return False
    finally:
        if cap is not None:
            cap.release()
