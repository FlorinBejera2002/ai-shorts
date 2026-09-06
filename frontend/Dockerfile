# syntax=docker/dockerfile:1
# OpenNext initializes Workerd during `next build`; its Linux binary requires
# glibc, so Alpine's musl runtime yields a misleading ENOENT at build time.
FROM node:22-bookworm-slim AS base

# Prisma selects its Debian OpenSSL 3 engine from this runtime dependency.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS dev
WORKDIR /app
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npx prisma generate
CMD ["npm", "run", "dev"]

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_DIST_DIR=.next
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Next's standalone trace does not include Prisma's dynamically loaded WASM.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
