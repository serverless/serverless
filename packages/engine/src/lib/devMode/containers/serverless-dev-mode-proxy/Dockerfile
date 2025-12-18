FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy application files
COPY . .

ARG PROXY_PORT=3000
ARG CONTROL_PORT=3001
EXPOSE ${PROXY_PORT} ${CONTROL_PORT}

# Use an entrypoint script to properly handle arguments
ENTRYPOINT ["node", "main.js"]
