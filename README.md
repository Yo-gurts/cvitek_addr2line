## Docker 打包与运行

### 打包镜像

在项目目录 `addr2line` 下执行：

```bash
tree .
.
├── addr2line-web
├── Dockerfile
├── host-tools
└── README.md
```

打包 docker 镜像：

```bash
docker build \
  -f Dockerfile \
  --build-arg APP_SRC=addr2line-web \
  --build-arg HOST_TOOLS_SRC=host-tools \
  --build-arg HOST_TOOLS_DST=/opt/host-tools \
  -t addr2line-web:latest \
  .
```

### 运行容器

```bash
docker run --rm -it \
  -p 8080:8080 \
  -e PORT=8080 \
  -e HOST_TOOLS_PATH=/opt/host-tools \
  addr2line-web:latest
```

启动后访问: `http://localhost:8080`

### 后台运行并开机自动启动

```bash
docker run -d \
  --name addr2line-web \
  --restart unless-stopped \
  -p 8080:8080 \
  -e PORT=8080 \
  -e HOST_TOOLS_PATH=/opt/host-tools \
  addr2line-web:latest
```

- `-d`: 后台运行
- `--restart unless-stopped`: Docker 服务或主机重启后自动拉起容器（手动停止除外）

### 运行时指定工具链路径

服务读取 `HOST_TOOLS_PATH` 环境变量。默认镜像内工具链路径为 `/opt/host-tools`，也可以在运行时改为其他路径：

```bash
docker run --rm -it \
  -p 8080:8080 \
  -e PORT=8080 \
  -e HOST_TOOLS_PATH=/custom/host-tools \
  -v /data/song.yu/host-tools:/custom/host-tools:ro \
  addr2line-web:latest
```
