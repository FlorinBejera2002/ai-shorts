# syntax=docker/dockerfile:1
# YouTube imports use yt-dlp's unpacked (onedir) build, which runs without
# Python and without extracting libraries into the noexec /tmp tmpfs. Deno is
# the JavaScript runtime yt-dlp needs to solve YouTube's player challenges.
# Bump both together when YouTube changes break downloads.
FROM debian:bookworm-slim AS youtube-tools
ARG TARGETARCH=amd64
ARG YTDLP_VERSION=2026.10.26
ARG DENO_VERSION=v2.9.8
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) ytdlp=yt-dlp_linux.zip; ytdlp_sha=f34053415136e55073dd64ba5326d161ecc23ce0e98c081d8752867b37809450; \
             deno=deno-x86_64-unknown-linux-gnu.zip; deno_sha=e890975bc2549807bbcc0b584ffafda72cc7c93349dd99c80483dd784f6c4609 ;; \
      arm64) ytdlp=yt-dlp_linux_aarch64.zip; ytdlp_sha=74708e707e8fa8177c8347e58152337edf320149cd7b225defd453f7cde47822; \
             deno=deno-aarch64-unknown-linux-gnu.zip; deno_sha=d49596c20b9788cf8f5d8ddf644103d4bde56ed239753f0bdb92ba9361d51905 ;; \
      *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSLo /tmp/yt-dlp.zip "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${ytdlp}"; \
    echo "${ytdlp_sha}  /tmp/yt-dlp.zip" | sha256sum -c -; \
    mkdir -p /opt/yt-dlp && unzip -q /tmp/yt-dlp.zip -d /opt/yt-dlp; \
    ln -s "$(find /opt/yt-dlp -maxdepth 1 -type f -name 'yt-dlp_linux*' | head -n1)" /opt/yt-dlp/yt-dlp; \
    chmod -R a+rX /opt/yt-dlp && chmod a+x /opt/yt-dlp/yt-dlp_linux*; \
    curl -fsSLo /tmp/deno.zip "https://github.com/denoland/deno/releases/download/${DENO_VERSION}/${deno}"; \
    echo "${deno_sha}  /tmp/deno.zip" | sha256sum -c -; \
    unzip -q /tmp/deno.zip -d /usr/local/bin && chmod 0755 /usr/local/bin/deno; \
    rm /tmp/yt-dlp.zip /tmp/deno.zip; \
    /opt/yt-dlp/yt-dlp --version && deno --version

FROM golang:1.26.5 AS dev
WORKDIR /src
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=youtube-tools /opt/yt-dlp /opt/yt-dlp
COPY --from=youtube-tools /usr/local/bin/deno /usr/local/bin/deno
ENV YTDLP_PATH=/opt/yt-dlp/yt-dlp XDG_CACHE_HOME=/tmp/.cache DENO_DIR=/tmp/deno
COPY go.mod go.sum ./
RUN go mod download
COPY --chown=10001:10001 . .
RUN chown 10001:10001 /src
CMD ["go", "run", "./cmd/api"]

FROM golang:1.26.5 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN mkdir -p /media && go test -race ./... && go vet ./... \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /api ./cmd/api \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /worker ./cmd/worker \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /migrate ./cmd/migrate \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /adminctl ./cmd/adminctl

FROM debian:bookworm-slim AS migrate
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /migrate /migrate
USER 10001:10001
ENTRYPOINT ["/migrate"]

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
    && cmake --build build --config Release --target whisper-cli whisper-vad-speech-segments -j2 \
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
# API and worker share the installed model inventory used by admin routing.
# Worker inherits these layers; model changes never accept arbitrary paths.
COPY --from=speech-build /whisper/models/ggml-base.bin /models/ggml-base.bin
COPY --from=speech-build /whisper/models/ggml-story.bin /models/ggml-story.bin
COPY --from=speech-build /whisper/models/ggml-vad.bin /models/ggml-vad.bin
COPY --from=speech-build /whisper/models/facefinder /models/facefinder
ENV WHISPER_CPP_MODEL=/models/ggml-base.bin PIGO_FACE_MODEL=/models/facefinder
ENV STORY_WHISPER_CPP_MODEL=/models/ggml-story.bin WHISPER_CPP_VAD_MODEL=/models/ggml-vad.bin
USER 10001:10001
EXPOSE 8080
ENV LISTEN_ADDR=:8080
ENTRYPOINT ["/api"]

FROM api AS worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /worker /worker
COPY --from=youtube-tools /opt/yt-dlp /opt/yt-dlp
COPY --from=youtube-tools /usr/local/bin/deno /usr/local/bin/deno
# The worker filesystem is read-only; tool caches live in the /tmp tmpfs.
ENV YTDLP_PATH=/opt/yt-dlp/yt-dlp XDG_CACHE_HOME=/tmp/.cache DENO_DIR=/tmp/deno
COPY --from=speech-build /whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=speech-build /whisper/build/bin/whisper-vad-speech-segments /usr/local/bin/whisper-vad-speech-segments
ENV WHISPER_CPP_PATH=/usr/local/bin/whisper-cli
USER 10001:10001
ENTRYPOINT ["/worker"]

# An untargeted backend build must run the API, never the migration command.
FROM api AS runner
