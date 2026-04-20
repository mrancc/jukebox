module.exports = {
  apps: [
    {
      name: "musicapi",
      script: "H:/min/musicAPI/index.js",
      cwd: "H:/min/musicAPI",
      env: {
        NODE_ENV: "production",
        PORT: 8001,
      },
    },
    {
      name: "jukebox",
      script: "app.js",
      cwd: "C:/Users/Administrator/Downloads/files",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // 如果 musicAPI 不在同一台机器，改成实际地址
        // MUSIC_API_URL: "http://你的服务器IP:8001",
      },
    },
  ],
};
