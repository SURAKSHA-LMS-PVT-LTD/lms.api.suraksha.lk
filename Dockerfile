# Multi-stage build for NestJS application
FROM node:20-alpine AS development

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include dev deps for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build && \
    echo "✅ Build completed" && \
    ls -la dist/ && \
    echo "📦 dist/main.js exists:" && \
    ls -la dist/main.js

# Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from development stage
COPY --from=development /app/dist ./dist

# Copy assets folder (required for templates, etc.)
COPY --from=development /app/assets ./assets

# Verify the build artifacts
RUN echo "📁 Verifying build artifacts..." && \
    ls -la && \
    echo "📦 dist folder contents:" && \
    ls -la dist/ && \
    echo "🎯 Checking dist/main.js:" && \
    ls -la dist/main.js && \
    echo "📚 node_modules exists:" && \
    ls -la node_modules/ | head -20

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Change ownership of the app directory
RUN chown -R nestjs:nodejs /app
USER nestjs

# Expose port (Cloud Run uses PORT environment variable, default 8080)
EXPOSE 8080

# Health check (using PORT environment variable)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/health || exit 1

# Start the application
CMD ["node", "dist/main"]
