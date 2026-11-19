# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
# Public origin for canonical URLs, hreflang, sitemap and JSON-LD.
ARG SITE_URL=https://sneepcut.com
# Optional: live plan catalog baked into the HTML and JSON-LD (prices also load in the browser).
ARG PLANS_SOURCE_URL=
ARG NEXT_PUBLIC_CONTACT_EMAIL=
ENV SITE_URL=$SITE_URL \
    PLANS_SOURCE_URL=$PLANS_SOURCE_URL \
    NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm build

FROM nginx:stable-alpine AS runner
COPY --from=builder /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
