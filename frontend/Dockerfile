# VITE_API_BASE_URL is a BUILD-time value: Vite substitutes import.meta.env.VITE_*
# into the static bundle when `vite build` runs, not read at container
# start. Changing it means rebuilding this image (`docker compose build
# frontend`), not just restarting the container -- pass it as a build arg,
# never expect an env var on `docker run`/`docker compose up` to change it.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.ts ./
EXPOSE 8081
CMD ["bun", "run", "server.ts"]
