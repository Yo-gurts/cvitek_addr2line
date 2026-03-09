"""
在线 addr2line 日志解析服务
"""
import os
import uuid
import shutil
import atexit
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session

from elf_utils import (
    ELFInfo, ToolchainManager, Addr2LineResolver, extract_addresses
)

# 配置
HOST_TOOLS_PATH = os.environ.get('HOST_TOOLS_PATH', '/data/cheng.tan/host-tools')
SESSIONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sessions')
MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB
PORT = int(os.environ.get('PORT', 8080))

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'addr2line-web-secret-key-change-in-production')
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# 初始化工具链管理器
toolchain_manager = ToolchainManager(HOST_TOOLS_PATH)

# 会话数据存储（内存中）
session_data = {}


def get_session_id():
    """获取或创建会话 ID"""
    if 'session_id' not in session:
        session['session_id'] = str(uuid.uuid4())
    return session['session_id']


def get_session_dir():
    """获取当前会话的临时目录"""
    session_id = get_session_id()
    session_dir = os.path.join(SESSIONS_DIR, session_id)
    if not os.path.exists(session_dir):
        os.makedirs(session_dir, exist_ok=True)
    return session_dir


def get_session_data():
    """获取当前会话的数据"""
    session_id = get_session_id()
    if session_id not in session_data:
        session_data[session_id] = {
            'elf_path': None,
            'elf_info': None,
            'selected_toolchain': None,
            'created_at': datetime.now(),
        }
    return session_data[session_id]


def cleanup_old_sessions():
    """清理过期的会话目录"""
    if not os.path.exists(SESSIONS_DIR):
        return
    
    cutoff = datetime.now() - timedelta(hours=24)
    
    for session_id in list(session_data.keys()):
        data = session_data.get(session_id, {})
        if data.get('created_at', datetime.now()) < cutoff:
            session_dir = os.path.join(SESSIONS_DIR, session_id)
            if os.path.exists(session_dir):
                shutil.rmtree(session_dir, ignore_errors=True)
            del session_data[session_id]


@app.route('/')
def index():
    """首页"""
    return render_template('index.html')


@app.route('/api/toolchains', methods=['GET'])
def get_toolchains():
    """获取所有可用工具链"""
    toolchains = toolchain_manager.get_all_toolchains()
    data = get_session_data()
    
    return jsonify({
        'toolchains': toolchains,
        'selected': data.get('selected_toolchain'),
        'host_tools_path': HOST_TOOLS_PATH,
    })


@app.route('/api/upload', methods=['POST'])
def upload_elf():
    """上传 ELF 文件"""
    if 'file' not in request.files:
        return jsonify({'error': '未选择文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400
    
    # 保存文件到会话目录
    session_dir = get_session_dir()
    elf_path = os.path.join(session_dir, 'yoc.elf')
    
    try:
        file.save(elf_path)
    except Exception as e:
        return jsonify({'error': f'保存文件失败: {str(e)}'}), 500
    
    # 解析 ELF 文件
    elf_info = ELFInfo(elf_path)
    
    if elf_info.error:
        return jsonify({'error': f'解析 ELF 失败: {elf_info.error}'}), 400
    
    # 查找匹配的工具链
    matching_toolchains = toolchain_manager.find_matching_toolchains(elf_info)
    recommended = toolchain_manager.get_recommended_toolchain(elf_info)
    
    # 保存到会话数据
    data = get_session_data()
    data['elf_path'] = elf_path
    data['elf_info'] = elf_info.to_dict()
    
    # 自动选择推荐的工具链
    if recommended:
        data['selected_toolchain'] = recommended
    
    return jsonify({
        'success': True,
        'elf_info': elf_info.to_dict(),
        'matching_toolchains': matching_toolchains,
        'recommended_toolchain': recommended,
        'selected_toolchain': data.get('selected_toolchain'),
    })


@app.route('/api/select-toolchain', methods=['POST'])
def select_toolchain():
    """手动选择工具链"""
    req_data = request.get_json()
    if not req_data or 'path' not in req_data:
        return jsonify({'error': '未指定工具链路径'}), 400
    
    toolchain_path = req_data['path']
    toolchain = toolchain_manager.get_toolchain_by_path(toolchain_path)
    
    if not toolchain:
        return jsonify({'error': '工具链不存在'}), 400
    
    data = get_session_data()
    data['selected_toolchain'] = toolchain
    
    return jsonify({
        'success': True,
        'selected_toolchain': toolchain,
    })


@app.route('/api/parse', methods=['POST'])
def parse_text():
    """解析文本中的所有地址"""
    req_data = request.get_json()
    if not req_data or 'text' not in req_data:
        return jsonify({'error': '未提供文本'}), 400
    
    text = req_data['text']
    data = get_session_data()
    
    if not data.get('elf_path'):
        return jsonify({'error': '请先上传 ELF 文件'}), 400
    
    if not data.get('selected_toolchain'):
        return jsonify({'error': '请先选择工具链'}), 400
    
    # 提取地址
    addresses = extract_addresses(text)
    
    if not addresses:
        return jsonify({
            'success': True,
            'addresses': [],
            'results': [],
            'message': '未找到任何地址',
        })
    
    # 解析地址
    resolver = Addr2LineResolver(
        data['selected_toolchain']['path'],
        data['elf_path']
    )
    results = resolver.resolve_many(addresses)
    
    return jsonify({
        'success': True,
        'addresses': addresses,
        'results': results,
        'toolchain': data['selected_toolchain'],
    })


@app.route('/api/resolve/<address>', methods=['GET'])
def resolve_address(address):
    """解析单个地址"""
    data = get_session_data()
    
    if not data.get('elf_path'):
        return jsonify({'error': '请先上传 ELF 文件'}), 400
    
    if not data.get('selected_toolchain'):
        return jsonify({'error': '请先选择工具链'}), 400
    
    resolver = Addr2LineResolver(
        data['selected_toolchain']['path'],
        data['elf_path']
    )
    result = resolver.resolve(address)
    
    return jsonify({
        'success': True,
        'result': result,
        'toolchain': data['selected_toolchain'],
    })


@app.route('/api/session-info', methods=['GET'])
def session_info():
    """获取当前会话信息"""
    data = get_session_data()
    return jsonify({
        'session_id': get_session_id(),
        'elf_path': data.get('elf_path'),
        'elf_info': data.get('elf_info'),
        'selected_toolchain': data.get('selected_toolchain'),
    })


# 启动时确保会话目录存在
os.makedirs(SESSIONS_DIR, exist_ok=True)

# 注册清理函数
atexit.register(cleanup_old_sessions)


if __name__ == '__main__':
    print(f"Host tools path: {HOST_TOOLS_PATH}")
    print(f"Found {len(toolchain_manager.toolchains)} toolchains")
    print(f"Sessions directory: {SESSIONS_DIR}")
    print(f"Starting server on http://0.0.0.0:{PORT}")
    
    app.run(host='0.0.0.0', port=PORT, debug=True)
