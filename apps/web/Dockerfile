# Web (React + Vite) — build context MUST be the repo root.
# On Railway set the service's RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile.
#
# VITE_API_URL is baked in at BUILD time (Vite inlines import.meta.env.*), so it
# must be set as a service variable — it is the API service's public URL, e.g.
# https://<your-api>.up.railway.app  (no trailing slash, no /api suffix).
FROM node:20-slim AS build

RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @app/types build \
  && pnpm --filter @app/web build

# --- runtime: serve the static build ---
FROM node:20-slim AS run
RUN npm install -g serve@14
WORKDIR /app
COPY --from=build /app/apps/web/dist ./dist

# Railway provides $PORT; serve the SPA with history fallback.
ENV PORT=8080
CMD ["sh", "-c", "serve -s dist -l ${PORT}"]
