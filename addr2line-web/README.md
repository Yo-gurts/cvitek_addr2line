# CVITEK 工具箱：Addr2line 日志解析

CVITEK 工具箱中的 Addr2line 功能，用于在线解析嵌入式系统日志中的地址，将十六进制地址转换为函数名和源码行号。工具箱还提供 MARS3 RTC 上下电原因解析页面，可通过 `/power-reason` 访问。

## 功能特性

- **ELF 文件上传**: 支持拖拽或点击上传 ELF 文件
- **自动识别架构**: 自动解析 ELF 文件的架构(ARM/AArch64/RISC-V)、位宽(32/64-bit)、字节序
- **工具链自动匹配**: 根据 ELF 架构自动推荐匹配的 addr2line 工具
- **手动选择工具链**: 支持下拉框手动选择特定的 addr2line 工具
- **地址高亮**: 日志文本中的地址自动高亮显示，可点击查看详情
- **会话隔离**: 每个浏览器会话使用独立的临时目录

## 目录结构

```
addr2line-web/
├── app.py              # Flask 主应用 (API 路由 + 会话管理)
├── elf_utils.py        # ELF 解析 + 工具链扫描/匹配
├── requirements.txt    # Python 依赖
├── README.md           # 本文件
├── sessions/           # 会话临时目录 (自动创建)
├── templates/
│   ├── index.html      # Addr2line 页面
│   └── power_reason.html # Power on reason 页面
└── static/
    ├── style.css       # 样式
    └── app.js          # 前端交互逻辑
```

## 安装

### 依赖

- Python 3.7+
- Flask
- pyelftools

### 安装步骤

```bash
cd addr2line-web

# 安装 Python 依赖
pip install -r requirements.txt
```

## 使用方法

### 启动服务

```bash
# 默认启动 (端口 8080，工具链路径 /data/cheng.tan/host-tools)
python app.py

# 自定义端口
PORT=9000 python app.py

# 自定义工具链路径
HOST_TOOLS_PATH=/path/to/host-tools python app.py

# 同时指定端口和工具链路径
PORT=9000 HOST_TOOLS_PATH=/path/to/host-tools python app.py
```

服务启动后访问: http://localhost:8080 (或自定义端口)

### 使用流程

1. **上传 ELF 文件**: 拖拽或点击上传区域，选择 yoc.elf 文件
2. **选择工具链**: 系统自动匹配，也可手动选择其他工具链
3. **粘贴日志**: 点击"粘贴日志"按钮，在弹窗中粘贴日志文本
4. **解析地址**: 点击"重新处理"按钮，解析所有地址
5. **查看详情**: 点击左侧高亮的地址，右侧显示函数名和源码行号

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8080` | 服务监听端口 |
| `HOST_TOOLS_PATH` | `/data/cheng.tan/host-tools` | 工具链根目录 |
| `SECRET_KEY` | (内置默认值) | Flask session 密钥 |

### 工具链目录结构

服务会自动扫描 `HOST_TOOLS_PATH/gcc/*/bin/*addr2line` 路径下的所有 addr2line 工具。

支持的架构:
- **ARM 32-bit**: `arm-*-addr2line`
- **AArch64 64-bit**: `aarch64-*-addr2line`
- **RISC-V**: `riscv64-*-addr2line`

## API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `GET /` | GET | Addr2line 工具页面 |
| `GET /power-reason` | GET | MARS3 RTC 上下电原因解析页面 |
| `POST /api/upload` | POST | 上传 ELF 文件 |
| `GET /api/toolchains` | GET | 获取所有可用工具链 |
| `POST /api/select-toolchain` | POST | 手动选择工具链 |
| `POST /api/parse` | POST | 解析文本中的所有地址 |
| `GET /api/resolve/<addr>` | GET | 解析单个地址 |
| `GET /api/session-info` | GET | 获取当前会话信息 |

## 示例

### 日志文本示例

```
Exception at 0x80001234
PC: 0x80005678
backtrace: 0x80002000 0x80003000 0x80004000
```

### 解析结果示例

```
地址: 0x80001234
解析结果: main at /path/to/src/main.c:42
工具链: riscv64-linux-x86_64
```

## 注意事项

- ELF 文件需要包含调试信息 (使用 `-g` 编译选项)
- 会话临时文件保存在 `sessions/` 目录，24小时后自动清理
- 生产环境部署建议使用 gunicorn 或 uwsgi
