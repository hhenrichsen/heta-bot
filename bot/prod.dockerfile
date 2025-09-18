FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig*.json ./
COPY src src
RUN bun run build

FROM oven/bun:1-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
COPY --from=builder /app/dist dist
CMD [ "bun", "run", "dist/main.js" ]
