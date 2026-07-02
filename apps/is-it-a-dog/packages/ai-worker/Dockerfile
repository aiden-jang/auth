# @napi-rs/canvas ships prebuilt binaries, so no Cairo/Pango system packages
# are needed — a plain node image suffices.
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY packages/ai-worker/package.json ./packages/ai-worker/
RUN npm install

COPY shared ./shared
COPY packages/ai-worker ./packages/ai-worker

EXPOSE 8090
CMD ["npm", "run", "start", "--workspace=ai-worker"]
