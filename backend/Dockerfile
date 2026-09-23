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
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /migrate ./cmd/migrate

FROM debian:bookworm-slim AS api
# Inspect uploaded video duration before sending it to TikTok. The API still
# runs as an unprivileged numeric user and keeps the same read-only runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /api /api
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
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git cmake g++ make curl \
    && git clone --depth 1 --branch ${WHISPER_VERSION} https://github.com/ggml-org/whisper.cpp /whisper
WORKDIR /whisper
RUN cmake -B build -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF \
    && cmake --build build --config Release --target whisper-cli -j2 \
    && bash models/download-ggml-model.sh base \
    && bash models/download-ggml-model.sh "${STORY_WHISPER_MODEL}" \
    && echo "${STORY_WHISPER_SHA1}  models/ggml-${STORY_WHISPER_MODEL}.bin" | sha1sum -c - \
    && cp "models/ggml-${STORY_WHISPER_MODEL}.bin" models/ggml-story.bin \
    && curl --fail --location https://raw.githubusercontent.com/esimov/pigo/v1.4.6/cascade/facefinder -o /whisper/models/facefinder

FROM api AS worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /worker /worker
COPY --from=speech-build /whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=speech-build /whisper/models/ggml-base.bin /models/ggml-base.bin
COPY --from=speech-build /whisper/models/ggml-story.bin /models/ggml-story.bin
COPY --from=speech-build /whisper/models/facefinder /models/facefinder
ENV WHISPER_CPP_PATH=/usr/local/bin/whisper-cli WHISPER_CPP_MODEL=/models/ggml-base.bin PIGO_FACE_MODEL=/models/facefinder
ENV STORY_WHISPER_CPP_MODEL=/models/ggml-story.bin
USER 10001:10001
ENTRYPOINT ["/worker"]

# An untargeted backend build must run the API, never the migration command.
FROM api AS runner
