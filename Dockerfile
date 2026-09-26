# ==============================================================================
# PaySync - Production Multi-stage Dockerfile (Unified Fullstack)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Frontend Builder
# ------------------------------------------------------------------------------
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

# Install frontend dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and build optimized production bundle
COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Backend & Fullstack Runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# Install native dependencies required for sqlite3 compilation if needed
RUN apk add --no-cache python3 make g++ curl wget

WORKDIR /app

# Set default production environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/app/data/app_data.db \
    UPLOAD_DIR=/app/backend/uploads

# Install backend production dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend source code, OCR models, and services
COPY backend/ ./backend/

# Copy compiled frontend assets into location expected by server.js (../frontend/dist)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create storage directory for persistent SQLite database and uploads
RUN mkdir -p /app/data /app/backend/uploads && \
    chown -R node:node /app

# Switch to non-root node user for hardened security
USER node

# Expose backend/application port
EXPOSE 3001

# Healthcheck to monitor application and database availability
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

# Start the fullstack application
CMD ["node", "backend/server.js"]
