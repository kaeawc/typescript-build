# syntax=docker/dockerfile:1.7

# Build stage: install deps and produce dist/ with the Bun native builder.
FROM oven/bun:1.4.5-alpine AS builder

WORKDIR /app

# Copy manifests first so dependency installation is cached independently of source.
# Runtime dependencies are all the bundler needs; dev tooling is skipped.
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production

# Bundle only the JavaScript entry. Declarations (`bun run build`) are for the
# published package, not the container.
COPY tsconfig.json build.ts ./
COPY src ./src
RUN bun build.ts

# Runtime stage: minimal Bun image with only the built artifacts.
FROM oven/bun:1.4.5-alpine AS runtime

WORKDIR /app

# Pin to the non-root user that the oven/bun image ships with.
USER bun

COPY --from=builder --chown=bun:bun /app/dist ./dist

ENTRYPOINT ["bun", "run", "dist/src/index.js"]
