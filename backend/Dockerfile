# ==============================================================================
# PaySync Backend - Standalone Production Dockerfile
# ==============================================================================

FROM node:22-alpine

# Install build dependencies for native sqlite3 if needed
RUN apk add --no-cache python3 make g++ curl wget

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/app/data/app_data.db \
    UPLOAD_DIR=/app/uploads

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Ensure storage directories exist
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

CMD ["node", "server.js"]
