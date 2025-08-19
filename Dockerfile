# Debian Bookworm ships recent compilers + Node 18
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates bash curl build-essential \
    openjdk-17-jdk-headless python3 nodejs sqlite3 mono-complete \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.js .

EXPOSE 8080
CMD ["npm","start"]
