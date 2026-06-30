FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy source
COPY tsconfig*.json ./
COPY src/ ./src/
COPY bin/ ./bin/
COPY demo/ ./demo/
COPY examples/ ./examples/

# Build
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/server/demo/server.js"]
