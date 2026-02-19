# LangGraph JS Minimal Agent - Dockerfile
#
# Multi-stage build for smaller production image.
# Uses Node.js 20 LTS with ES Modules support.

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-slim AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:20-slim AS production

WORKDIR /app

# Create non-root user for security
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home agent

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY agent.js ./
COPY package.json ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Switch to non-root user
USER agent

# Expose the AgentCore runtime port
EXPOSE 8080

# Start the agent
CMD ["node", "agent.js"]
