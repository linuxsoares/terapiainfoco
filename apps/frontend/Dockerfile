FROM oven/bun:1-alpine AS build
WORKDIR /app

# Copy the whole monorepo (respecting .dockerignore) so every workspace
# manifest referenced by bun.lock is present.
COPY . .

RUN bun install --frozen-lockfile

# Vite inlines import.meta.env.VITE_* at build time.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN bun run --filter=@terapiainfoco/frontend build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app

EXPOSE 3000

CMD ["sh", "-c", "bun run --cwd apps/frontend preview --host 0.0.0.0 --port ${PORT:-3000}"]
