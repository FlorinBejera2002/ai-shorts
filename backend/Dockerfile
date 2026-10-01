# syntax=docker/dockerfile:1
FROM golang:1.26.5 AS dev
WORKDIR /src
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

FROM debian:bookworm-slim AS api
# Inspect uploaded video duration before sending it to TikTok. The API still
# runs as an unprivileged numeric user and keeps the same read-only runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /api /api
COPY --from=build /adminctl /adminctl
COPY --from=build --chown=10001:10001 /media /app/media
USER 10001:10001
EXPOSE 8080
ENV LISTEN_ADDR=:8080
ENTRYPOINT ["/api"]

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

FROM api AS worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /worker /worker
COPY --from=speech-build /whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=speech-build /whisper/build/bin/whisper-vad-speech-segments /usr/local/bin/whisper-vad-speech-segments
COPY --from=speech-build /whisper/models/ggml-base.bin /models/ggml-base.bin
COPY --from=speech-build /whisper/models/ggml-story.bin /models/ggml-story.bin
COPY --from=speech-build /whisper/models/ggml-vad.bin /models/ggml-vad.bin
COPY --from=speech-build /whisper/models/facefinder /models/facefinder
ENV WHISPER_CPP_PATH=/usr/local/bin/whisper-cli WHISPER_CPP_MODEL=/models/ggml-base.bin PIGO_FACE_MODEL=/models/facefinder
ENV STORY_WHISPER_CPP_MODEL=/models/ggml-story.bin
ENV WHISPER_CPP_VAD_MODEL=/models/ggml-vad.bin
USER 10001:10001
ENTRYPOINT ["/worker"]

# An untargeted backend build must run the API, never the migration command.
FROM api AS runner
