# syntax=docker/dockerfile:1
FROM golang:1.26.5 AS dev
WORKDIR /src
ENV XDG_CACHE_HOME=/tmp/.cache
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY go.mod go.sum ./
RUN go mod download
COPY --chown=10001:10001 . .
RUN chown 10001:10001 /src
CMD ["go", "run", "./cmd/api"]

FROM golang:1.26.5 AS build
WORKDIR /src
# Native media regressions require FFmpeg and FFprobe in the build environment.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN mkdir -p /media && go test -race ./... && go vet ./... \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /api ./cmd/api \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /worker ./cmd/worker \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /migrate ./cmd/migrate \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /adminctl ./cmd/adminctl \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /migrate-media-s3 ./cmd/migrate-media-s3

FROM debian:bookworm-slim AS migrate
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /migrate /migrate
USER 10001:10001
ENTRYPOINT ["/migrate"]

FROM migrate AS storage-migrate
COPY --from=build /migrate-media-s3 /migrate-media-s3
ENTRYPOINT ["/migrate-media-s3"]

FROM debian:bookworm-slim AS speech-build
ARG WHISPER_VERSION=v1.8.3
ARG STORY_WHISPER_MODEL=large-v3-turbo-q5_0
ARG STORY_WHISPER_SHA1=e050f7970618a659205450ad97eb95a18d69c9ee
ARG WHISPER_VAD_MODEL=silero-v6.2.0
ARG WHISPER_VAD_SHA256=2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git cmake g++ make curl \
    && git clone --depth 1 --branch ${WHISPER_VERSION} https://github.com/ggml-org/whisper.cpp /whisper
WORKDIR /whisper
# v1.8.3's standalone VAD CLI assigns its silence option to the speech field.
# Correct that parser typo so caption evidence uses the same settings as ASR.
RUN sed -i '/--vad-min-silence-duration-ms")/s/cli_params.vad_min_speech_duration_ms/cli_params.vad_min_silence_duration_ms/' examples/vad-speech-segments/speech.cpp \
    && cmake -B build -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF \
    && cmake --build build --config Release --target whisper-cli whisper-vad-speech-segments -j2
# Keep transient model-host failures from invalidating the native compilation.
# The upstream download scripts invoke curl, which reads this build-only config.
RUN printf '%s\n' 'fail' 'retry = 5' 'retry-all-errors' 'connect-timeout = 30' > /root/.curlrc \
    && bash models/download-ggml-model.sh base \
    && bash models/download-ggml-model.sh "${STORY_WHISPER_MODEL}" \
    && echo "${STORY_WHISPER_SHA1}  models/ggml-${STORY_WHISPER_MODEL}.bin" | sha1sum -c - \
    && cp "models/ggml-${STORY_WHISPER_MODEL}.bin" models/ggml-story.bin \
    && bash models/download-vad-model.sh "${WHISPER_VAD_MODEL}" \
    && echo "${WHISPER_VAD_SHA256}  models/ggml-${WHISPER_VAD_MODEL}.bin" | sha256sum -c - \
    && cp "models/ggml-${WHISPER_VAD_MODEL}.bin" models/ggml-vad.bin \
    && curl --fail --location https://raw.githubusercontent.com/esimov/pigo/v1.4.6/cascade/facefinder -o /whisper/models/facefinder

FROM debian:bookworm-slim AS api
# Inspect uploaded video duration before sending it to TikTok. The API still
# runs as an unprivileged numeric user and keeps the same read-only runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /api /api
COPY --from=build /adminctl /adminctl
COPY --from=build --chown=10001:10001 /media /app/media
# Google exports can be several GB. Keep staging on a private disk volume,
# outside served media and the API's memory-backed /tmp.
RUN install -d -o 10001 -g 10001 -m 0700 /app/youtube-import-tmp
# API and worker share the installed model inventory used by admin routing.
# Worker inherits these layers; model changes never accept arbitrary paths.
COPY --from=speech-build /whisper/models/ggml-base.bin /models/ggml-base.bin
COPY --from=speech-build /whisper/models/ggml-story.bin /models/ggml-story.bin
COPY --from=speech-build /whisper/models/ggml-vad.bin /models/ggml-vad.bin
COPY --from=speech-build /whisper/models/facefinder /models/facefinder
# Clips and Story Builder share large-v3-turbo: clip selection, hooks and
# captions all depend on transcript accuracy. ggml-base stays installed so
# admin routing can still select it on constrained hosts.
ENV WHISPER_CPP_MODEL=/models/ggml-story.bin PIGO_FACE_MODEL=/models/facefinder
ENV STORY_WHISPER_CPP_MODEL=/models/ggml-story.bin WHISPER_CPP_VAD_MODEL=/models/ggml-vad.bin
USER 10001:10001
EXPOSE 8080
ENV LISTEN_ADDR=:8080
ENTRYPOINT ["/api"]

FROM node:24-bookworm-slim AS youtube-tools
# Official standalone binaries include yt-dlp-ejs. Pin both architectures and
# never install plugins or fetch executable components while processing a job.
ARG YT_DLP_VERSION=2026.11.23
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && case "${TARGETARCH}" in \
       amd64) asset=yt-dlp_linux; checksum=249ddb058234276bc449b9cd9492aad9f133bda5923c61a9e39983ae114ef17d ;; \
       arm64) asset=yt-dlp_linux_aarch64; checksum=fb847a2e4a9ddc8cf5fcfb4bb7f42ba8969ecf72068def0278074f9d300bd13c ;; \
       *) exit 1 ;; esac \
    && curl --fail --location --retry 3 "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${asset}" -o /usr/local/bin/yt-dlp \
    && echo "${checksum}  /usr/local/bin/yt-dlp" | sha256sum -c - \
    && chmod 0755 /usr/local/bin/yt-dlp

FROM api AS worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 libatomic1 fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
RUN install -d -o 10001 -g 10001 -m 0700 /app/processing-tmp
COPY --from=youtube-tools /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=youtube-tools /usr/local/bin/node /usr/local/bin/node
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp YOUTUBE_NODE_PATH=/usr/local/bin/node PROCESSING_TEMP_DIR=/app/processing-tmp
COPY --from=build /worker /worker
# The worker filesystem is read-only; tool caches live in the /tmp tmpfs.
ENV XDG_CACHE_HOME=/tmp/.cache
COPY --from=speech-build /whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=speech-build /whisper/build/bin/whisper-vad-speech-segments /usr/local/bin/whisper-vad-speech-segments
ENV WHISPER_CPP_PATH=/usr/local/bin/whisper-cli
USER 10001:10001
ENTRYPOINT ["/worker"]

# An untargeted backend build must run the API, never the migration command.
FROM api AS runner
