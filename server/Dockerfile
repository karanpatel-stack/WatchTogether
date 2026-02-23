FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++ linux-headers
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 make g++ linux-headers && \
    npm ci --omit=dev && \
    apk del python3 make g++ linux-headers
COPY --from=build /app/dist ./dist
EXPOSE 3001
EXPOSE 40000-40200/udp
EXPOSE 40000-40200/tcp
USER node
CMD ["node", "dist/index.js"]
