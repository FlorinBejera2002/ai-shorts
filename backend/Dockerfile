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
ARG WHISPER_VAD_MODEL=silero-v6.2.0
ARG WHISPER_VAD_SHA256=2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git cmake g++ make curl \
    && git clone --depth 1 --branch ${WHISPER_VERSION} https://github.com/ggml-org/whisper.cpp /whisper
WORKDIR /whisper
# v1.8.3's standalone VAD CLI assigns its silence option to the speech field.
# Correct that parser typo so voice evidence uses its configured settings.
# Speech transcription is hosted (OpenRouter); only this detector is built.
RUN sed -i '/--vad-min-silence-duration-ms")/s/cli_params.vad_min_speech_duration_ms/cli_params.vad_min_silence_duration_ms/' examples/vad-speech-segments/speech.cpp \
    && cmake -B build -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF \
    && cmake --build build --config Release --target whisper-vad-speech-segments -j2
# Keep transient model-host failures from invalidating the native compilation.
# The upstream download scripts invoke curl, which reads this build-only config.
RUN printf '%s\n' 'fail' 'retry = 5' 'retry-all-errors' 'connect-timeout = 30' > /root/.curlrc \
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
COPY --from=speech-build /whisper/models/ggml-vad.bin /models/ggml-vad.bin
COPY --from=speech-build /whisper/models/facefinder /models/facefinder
ENV PIGO_FACE_MODEL=/models/facefinder WHISPER_CPP_VAD_MODEL=/models/ggml-vad.bin
USER 10001:10001
EXPOSE 8080
ENV LISTEN_ADDR=:8080
ENTRYPOINT ["/api"]

FROM api AS worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /worker /worker
# The worker filesystem is read-only; tool caches live in the /tmp tmpfs.
ENV XDG_CACHE_HOME=/tmp/.cache
COPY --from=speech-build /whisper/build/bin/whisper-vad-speech-segments /usr/local/bin/whisper-vad-speech-segments
ENV WHISPER_CPP_VAD_PATH=/usr/local/bin/whisper-vad-speech-segments
USER 10001:10001
ENTRYPOINT ["/worker"]

# An untargeted backend build must run the API, never the migration command.
FROM api AS runner
