# API (NestJS + Prisma) — build context MUST be the repo root so the
# workspace packages (@app/ordering, @app/types) are available.
# On Railway set the service's RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile.
FROM node:20-slim

# openssl is required by Prisma's query engine at runtime.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.33.0

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @app/ordering build \
  && pnpm --filter @app/types build \
  && pnpm --filter @app/api build

WORKDIR /app/apps/api
ENV NODE_ENV=production

# Apply committed migrations, seed the default admin (idempotent, non-fatal),
# then start. DATABASE_URL / JWT secrets / PORT come from Railway variables.
CMD ["sh", "-c", "npx prisma migrate deploy && (npx prisma db seed || true) && node dist/main.js"]
