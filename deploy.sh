#!/bin/bash
# ============================================================
#  点歌台 - 一键部署脚本（在服务器上运行）
#  用法：chmod +x deploy.sh && ./deploy.sh
# ============================================================

set -e

# ── 颜色 ────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🎵 点歌台部署脚本${NC}"
echo "================================"

# ── 检查 Docker ──────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Docker 未安装，正在自动安装...${NC}"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  echo -e "${GREEN}✅ Docker 安装完成${NC}"
else
  echo -e "${GREEN}✅ Docker 已安装：$(docker --version)${NC}"
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
  echo -e "${YELLOW}安装 docker-compose...${NC}"
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  echo -e "${GREEN}✅ docker-compose 安装完成${NC}"
fi

# ── 确认目录结构 ─────────────────────────────────────────────
DEPLOY_DIR="/opt/jukebox"
echo ""
echo "部署目录：$DEPLOY_DIR"
echo "目录结构应为："
echo "  $DEPLOY_DIR/"
echo "  ├── docker-compose.yml"
echo "  ├── jukebox/       ← 点歌台（app.js + index.html）"
echo "  └── musicAPI/      ← musicAPI 项目"
echo ""

if [ ! -f "$DEPLOY_DIR/docker-compose.yml" ]; then
  echo -e "${RED}❌ 未找到 $DEPLOY_DIR/docker-compose.yml，请先上传项目文件！${NC}"
  echo "参考文档：DEPLOY.md"
  exit 1
fi

# ── 设置管理员密码 ────────────────────────────────────────────
if grep -q "your_strong_password_here" "$DEPLOY_DIR/docker-compose.yml"; then
  echo -e "${YELLOW}⚠️  检测到管理员密码未修改！${NC}"
  read -p "请输入管理员密码（直接回车使用随机密码）：" ADMIN_PWD
  if [ -z "$ADMIN_PWD" ]; then
    ADMIN_PWD=$(openssl rand -base64 12)
    echo -e "${GREEN}生成随机密码：${ADMIN_PWD}${NC}"
    echo "⚠️  请记住这个密码！"
  fi
  sed -i "s/your_strong_password_here/$ADMIN_PWD/" "$DEPLOY_DIR/docker-compose.yml"
  echo -e "${GREEN}✅ 密码已设置${NC}"
fi

# ── 构建并启动 ───────────────────────────────────────────────
cd "$DEPLOY_DIR"
echo ""
echo -e "${YELLOW}📦 正在构建 Docker 镜像...（首次可能需要几分钟）${NC}"
docker-compose build --no-cache

echo ""
echo -e "${YELLOW}🚀 正在启动服务...${NC}"
docker-compose up -d

# ── 等待启动 ─────────────────────────────────────────────────
sleep 3
echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}🎉 部署完成！${NC}"
echo ""
echo "访问地址：http://$(curl -s ifconfig.me 2>/dev/null || echo '你的服务器IP'):3000"
echo ""
echo "常用命令："
echo "  查看日志：  docker-compose logs -f"
echo "  重启服务：  docker-compose restart"
echo "  停止服务：  docker-compose down"
echo -e "${GREEN}================================${NC}"
