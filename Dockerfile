# syntax=docker/dockerfile:1.10
# Production image for the Wildward API. Used by deploy/docker-compose.prod.yml (docs/DEPLOYMENT.md).
# Runs compiled JavaScript only: the CLIs are dist/cli/*.js (no ts-node in production).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY --chmod=755 src ./src
RUN npm run build

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4000 MEDIA_DIR=/data/media
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# --chmod: the image must not depend on the permissions of the checkout it was built from
# (a working copy with 0700 folders otherwise leaves them unreadable to the node user).
# The CLIs resolve these relative to the app root (dist/cli/../../drizzle and ../../data).
COPY --chmod=755 drizzle ./drizzle
COPY --chmod=755 data ./data
# Real-catalogue import files and their checked photos, so imports can run inside the container
# against the media volume: docker compose run --rm api node dist/cli/import.js catalogue/<file>.json --dry-run
COPY --chmod=755 catalogue ./catalogue
RUN mkdir -p /data/media /app/import-reports && chown -R node:node /data/media /app/import-reports
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
