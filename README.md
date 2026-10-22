# CVITEK 工具箱

面向 CVITEK 嵌入式开发的 Web 工具集合。目前提供两项功能，可通过页面底部的功能栏切换：

- **Addr2line**：上传 ELF 文件，解析日志中的地址并查看源码位置。
- **Power on reason**：解析 MARS3 RTC 上下电原因寄存器，展示状态和触发信号。

## Docker 部署

在仓库根目录构建镜像：

```bash
docker build -t cvitek-toolbox:latest .
```

启动服务：

```bash
docker run -d \
  --name cvitek-toolbox \
  --restart unless-stopped \
  -p 8080:8080 \
  cvitek-toolbox:latest
```

浏览器访问 `http://localhost:8080`。Power on reason 页面也可直接通过 `http://localhost:8080/power-reason` 打开。

Docker 镜像会将仓库内 `host-tools/` 下的 addr2line 工具链安装到 `/opt/host-tools`。

## 本地运行

```bash
cd addr2line-web
pip install -r requirements.txt
HOST_TOOLS_PATH=../host-tools python app.py
```

默认监听 `0.0.0.0:8080`。可使用 `PORT` 修改端口，或用 `HOST_TOOLS_PATH` 指定 addr2line 工具链目录。
