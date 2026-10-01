# syntax = docker/dockerfile:1

# CarCheck: plain Node.js, no framework, no build step (Node runs .ts files
# directly and node:sqlite is built in) — see PROCESS.md for why. The image
# needs no `pnpm install`: server.ts/db.ts/routes.ts/html.ts have zero runtime
# dependencies, only devDependencies used by the test harness.

FROM node:24-alpine

WORKDIR /app
COPY server.ts db.ts routes.ts html.ts README.md ./

CMD ["node", "server.ts"]
