# syntax=docker/dockerfile:1
# Shared image for the API (default CMD) and the Celery worker
# (compose overrides `command:`). Build once, run both.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CPU-only torch first: the default PyPI wheels bundle CUDA (~7 GB) that no
# container here can use (whisper_device=cpu, no GPU reservation in compose).
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install torch==2.11.* torchvision==0.26.* \
      --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

RUN mkdir -p /app/media

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
