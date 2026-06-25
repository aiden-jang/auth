# API-only production image: Fastify serves the API. Frontends are hosted separately
# (e.g. Cloudflare Pages) and call this over CORS.
FROM node:22-slim AS base
# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS build
# Install deps first (cached unless a package.json or the lockfile changes).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
# Build shared + server.
COPY . .
RUN pnpm --filter @aidenjang/server exec prisma generate
RUN pnpm -r build

FROM base AS runner
ENV NODE_ENV=production
# Bring over the installed deps + build output. DATABASE_URL is provided at runtime.
COPY --from=build /app /app
EXPOSE 3000
# Apply any pending migrations, then start the server.
CMD ["sh", "-c", "pnpm --filter @aidenjang/server exec prisma migrate deploy && node packages/server/dist/index.js"]
