# 🎵 点歌台 Docker 部署指南

## 前提条件

- 一台 Linux 服务器（推荐 Ubuntu 22.04，1核2G 内存即可）
- 开放 **3000 端口**（安全组 + 防火墙）
- 本机安装了 **SCP / SFTP / FTP** 工具用于上传文件（推荐 [WinSCP](https://winscp.net/）或 [FileZilla](https://filezilla-project.org/)）

---

## 第一步：整理上传文件

在本地整理好以下目录结构，然后**整体上传**到服务器 `/opt/jukebox/`：

```
本地打包目录/
├── docker-compose.yml      ← 来自 downloads/files/
├── deploy.sh               ← 来自 downloads/files/
├── jukebox/                ← 新建文件夹，放点歌台文件
│   ├── app.js
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── Dockerfile
└── musicAPI/               ← 直接复制 H:\min\musicAPI\ 整个目录
    ├── server.js
    ├── index.js
    ├── src/
    ├── package.json
    └── Dockerfile
```

> 💡 **注意**：`docker-compose.yml` 里的路径已经配好了，`./jukebox` 和 `./musicAPI` 是相对路径，按上面结构放就行。

---

## 第二步：上传到服务器

**方式 A：用 WinSCP（推荐新手）**
1. 打开 WinSCP，填入服务器 IP、用户名、密码连接
2. 右侧导航到 `/opt/`（没有 jukebox 目录就创建一个）
3. 把左侧整理好的目录拖进去

**方式 B：用命令行 scp**
```powershell
# 在你的本机 PowerShell 里运行
scp -r "C:\本地打包目录\*" root@你的服务器IP:/opt/jukebox/
```

---

## 第三步：在服务器上执行部署

SSH 连接服务器后：

```bash
# 进入目录
cd /opt/jukebox

# 给脚本加执行权限
chmod +x deploy.sh

# 一键部署（会自动安装 Docker、构建镜像、启动服务）
./deploy.sh
```

脚本会提示你设置管理员密码，设置完等待构建完成即可。

---

## 第四步：验证访问

```bash
# 查看服务是否正常运行
docker-compose ps

# 查看实时日志
docker-compose logs -f
```

浏览器访问：`http://你的服务器IP:3000`

---

## 日常运维命令

```bash
cd /opt/jukebox

# 查看运行状态
docker-compose ps

# 查看日志（Ctrl+C 退出）
docker-compose logs -f

# 只看点歌台的日志
docker-compose logs -f jukebox

# 重启所有服务
docker-compose restart

# 停止
docker-compose down

# 更新代码后重新部署
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## 可选：配置域名 + HTTPS

如果你有域名，建议配 Nginx 反代 + HTTPS（HTTPS 下浏览器音频播放更稳定）：

```bash
# 安装 Nginx
sudo apt install -y nginx

# 安装 certbot（免费 HTTPS 证书）
sudo apt install -y certbot python3-certbot-nginx

# 申请证书（替换成你的域名）
sudo certbot --nginx -d your-domain.com
```

Nginx 配置（`/etc/nginx/sites-available/jukebox`）：
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    # certbot 自动填入证书路径
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Socket.io 必须的头
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/jukebox /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

---

## 常见问题

| 问题 | 解决方法 |
|------|---------|
| 访问不了 3000 端口 | 检查云服务器控制台的**安全组**是否开放 3000 端口 |
| 构建失败 npm install 报错 | 多试几次（可能是网络问题），或换国内镜像：在 Dockerfile 里加 `RUN npm config set registry https://registry.npmmirror.com` |
| Socket.io 连接失败 | 确认没有防火墙拦截 WebSocket，Nginx 反代时检查 `Upgrade` 头是否配置 |
| 音乐播放失败 | QQ 音乐链接有时效性，重新点歌即可；如果批量失败检查 musicAPI 服务是否正常 `docker-compose logs musicapi` |
