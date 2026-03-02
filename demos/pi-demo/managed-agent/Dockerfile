FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npx tsc

FROM node:20-alpine

WORKDIR /app
RUN addgroup -g 1001 -S parallax && \
    adduser -S parallax -u 1001 -G parallax

COPY --from=builder /app/package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

USER parallax
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
