FROM node:20-slim
WORKDIR /app

RUN apt-get update && apt-get install -y openssl default-mysql-client && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

CMD ["sh", "-c", "until npx prisma db push --skip-generate --accept-data-loss; do echo 'Waiting for MariaDB...'; sleep 3; done && node dist/bot.js"]
