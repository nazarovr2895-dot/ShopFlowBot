FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/admin-panel/package.json packages/admin-panel/
COPY packages/seller-panel/package.json packages/seller-panel/

RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_URL
ARG VITE_YANDEX_MAPS_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_YANDEX_MAPS_KEY=$VITE_YANDEX_MAPS_KEY

RUN echo "{\"apiUrl\":\"${VITE_API_URL}\",\"ymapsApiKey\":\"${VITE_YANDEX_MAPS_KEY}\"}" > packages/admin-panel/public/config.json
RUN cd packages/admin-panel && pnpm build

FROM nginx:alpine
COPY --from=build /app/packages/admin-panel/dist /usr/share/nginx/html
COPY packages/admin-panel/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
