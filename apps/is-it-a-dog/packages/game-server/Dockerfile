# Multi-workspace build: copy the whole monorepo so `shared` resolves.
FROM node:22-alpine
WORKDIR /app

# Install deps using the workspace manifests for better layer caching.
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY packages/game-server/package.json ./packages/game-server/
RUN npm install

# Copy source.
COPY shared ./shared
COPY packages/game-server ./packages/game-server

EXPOSE 8080
CMD ["npm", "run", "start", "--workspace=game-server"]
