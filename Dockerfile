FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv git ca-certificates openssl poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Python nur als Extraktions-Werkzeug (trafilatura), wie git/rclone
RUN python3 -m venv .venv && .venv/bin/pip install --no-cache-dir trafilatura lxml_html_clean

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npm run start"]
