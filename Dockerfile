FROM node:22.14-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

CMD ["pnpm", "start"]