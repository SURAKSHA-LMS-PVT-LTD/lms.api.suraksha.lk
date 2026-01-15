# Multi-stage build for NestJS application
FROM node:20-alpine AS development

# Set timezone for development stage
ENV TZ=Asia/Colombo

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include dev deps for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application with verification
RUN npm run build && \
    echo "✅ Build completed successfully" && \
    echo "📦 Listing dist directory:" && \
    ls -laR dist/ && \
    echo "🎯 Checking for main.js:" && \
    find dist -name "main.js" && \
    if [ -f dist/main.js ]; then \
        echo "✅ Found dist/main.js"; \
    elif [ -f dist/src/main.js ]; then \
        echo "✅ Found dist/src/main.js"; \
    else \
        echo "❌ main.js NOT FOUND"; \
        exit 1; \
    fi

# Production stage
FROM node:20-alpine AS production

# Set environment variables for production
ENV TZ=Asia/Colombo
ENV PORT=8080

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from development stage
COPY --from=development /app/dist ./dist

# Copy assets folder (required for PDF templates)
COPY --from=development /app/assets ./assets

# Verify copied files
RUN echo "📁 Production stage - Verifying copied files:" && \
    ls -la && \
    echo "📦 Contents of dist/:" && \
    ls -laR dist/ && \
    echo "🎯 Checking for main.js:" && \
    if [ -f dist/main.js ]; then \
        echo "✅ Found dist/main.js"; \
    elif [ -f dist/src/main.js ]; then \
        echo "✅ Found dist/src/main.js"; \
    else \
        echo "❌ main.js NOT FOUND in dist"; \
        exit 1; \
    fi

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

# Start the application (check both possible locations)
CMD if [ -f dist/src/main.js ]; then node dist/src/main.js; else node dist/main.js; fi
