# 点歌台 - Dockerfile
# 多阶段构建：先安装依赖，再运行
FROM node:18-alpine

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY package.json package-lock.json ./
RUN npm ci --production

# 再复制应用代码
COPY index.html app.js ./

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "app.js"]
