# syntax=docker/dockerfile:1
# OpenNext initializes Workerd during `next build`; its Linux binary requires
# glibc, so Alpine's musl runtime yields a misleading ENOENT at build time.
FROM node:22-bookworm-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS dev
WORKDIR /app
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
CMD ["npm", "run", "dev"]

FROM base AS builder
WORKDIR /app
ARG GO_API_URL=http://backend-go:8080
ARG MEDIA_PROXY_HOST=http://nginx:80
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_CONTACT_EMAIL=
ARG NEXT_PUBLIC_UPLOAD_URL=
ARG NEXT_IMAGE_REMOTE_HOSTS=
ARG NEXT_DEPLOYMENT_ID=
ENV GO_API_URL=$GO_API_URL
ENV MEDIA_PROXY_HOST=$MEDIA_PROXY_HOST
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL
ENV NEXT_PUBLIC_UPLOAD_URL=$NEXT_PUBLIC_UPLOAD_URL
ENV NEXT_IMAGE_REMOTE_HOSTS=$NEXT_IMAGE_REMOTE_HOSTS
ENV NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_DIST_DIR=.next
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
