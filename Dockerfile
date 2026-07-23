FROM oven/bun:1.3.5 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.5-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build --chown=bun:bun /app/package.json /app/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build --chown=bun:bun /app/build ./build
COPY --from=build --chown=bun:bun /app/src/game ./src/game
COPY --from=build --chown=bun:bun /app/src/shared ./src/shared
COPY --from=build --chown=bun:bun /app/src/server ./src/server
USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s CMD bun -e "fetch('http://127.0.0.1:3000/health').then((r) => { if (!r.ok) process.exit(1) })"
CMD ["bun", "run", "src/server/index.ts"]
