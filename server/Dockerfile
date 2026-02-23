FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
RUN npm prune --omit=dev && rm -rf src tsconfig.json
EXPOSE 3001
EXPOSE 40000-40200/udp
EXPOSE 40000-40200/tcp
USER node
CMD ["node", "dist/index.js"]