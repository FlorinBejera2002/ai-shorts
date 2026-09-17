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
RUN mkdir -p /media && go test -race ./... && go vet ./... && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /api ./cmd/api

FROM debian:bookworm-slim
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
