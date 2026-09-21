# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM deps AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY . .
CMD ["pnpm", "dev", "--host"]

FROM base AS builder
WORKDIR /app
ARG VITE_API_URL=
ARG VITE_APP_URL=http://localhost:5173
ARG VITE_STUDIO_URL=
ARG VITE_CONTACT_EMAIL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_STUDIO_URL=$VITE_STUDIO_URL
ENV VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM nginx:stable-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY <<'CONF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
CONF
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
