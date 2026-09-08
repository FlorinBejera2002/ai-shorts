# syntax=docker/dockerfile:1
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 HOME=/tmp/sneepcut

WORKDIR /app

RUN groupadd --gid 10001 sneepcut \
    && useradd --uid 10001 --gid 10001 --no-create-home sneepcut \
    && mkdir -p /app/media && chown 10001:10001 /app/media
COPY requirements-api.txt requirements-ml.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements-api.txt
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

FROM base AS ml

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# CPU-only torch first: the default PyPI wheels bundle CUDA (~7 GB) that no
# container here can use (whisper_device=cpu, no GPU reservation in compose).
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install torch==2.11.* torchvision==0.26.* \
      --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements-ml.txt

# Dependency installation can create root-owned caches under HOME.
# Transfer them before switching to the unprivileged processing worker.
RUN mkdir -p "$HOME/.cache/huggingface" \
    && chown -R 10001:10001 "$HOME"

USER 10001:10001
CMD ["celery", "-A", "app.workers.celery_app:celery_app", "worker", "--loglevel=info", "--concurrency=2"]

FROM ml AS ml-dev
USER root
RUN chown -R 10001:10001 /app/app
USER 10001:10001

FROM base AS api-dev
RUN chown -R 10001:10001 /app/app
USER 10001:10001

FROM base AS api
USER 10001:10001
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
