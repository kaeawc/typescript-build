# syntax=docker/dockerfile:1.7

# Build stage: install deps and produce dist/ with the Bun native builder.
FROM oven/bun:1.3.12-alpine AS builder

WORKDIR /app

# Copy manifests first so dependency installation is cached independently of source.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the project and build.
COPY tsconfig.json build.ts ./
COPY src ./src
RUN bun run build

# Runtime stage: minimal Bun image with only the built artifacts.
FROM oven/bun:1.3.12-alpine AS runtime

WORKDIR /app

# Pin to the non-root user that the oven/bun image ships with.
USER bun

COPY --from=builder --chown=bun:bun /app/dist ./dist

ENTRYPOINT ["bun", "run", "dist/src/index.js"]
