/**
 * 在线 addr2line 日志解析 - 前端交互逻辑
 */

// DOM 元素
const elements = {
    // 上传
    uploadArea: document.getElementById('upload-area'),
    elfFile: document.getElementById('elf-file'),
    uploadProgress: document.getElementById('upload-progress'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
    
    // ELF 信息
    elfInfo: document.getElementById('elf-info'),
    elfArch: document.getElementById('elf-arch'),
    elfBits: document.getElementById('elf-bits'),
    elfEndian: document.getElementById('elf-endian'),
    
    // 工具链
    toolchainSelect: document.getElementById('toolchain-select'),
    currentToolchain: document.getElementById('current-toolchain'),
    toolchainName: document.getElementById('toolchain-name'),
    toolchainPath: document.getElementById('toolchain-path'),
    
    // 状态
    statusBar: document.getElementById('status-bar'),
    statusIcon: document.getElementById('status-icon'),
    statusMessage: document.getElementById('status-message'),
    
    // 操作按钮
    pasteBtn: document.getElementById('paste-btn'),
    parseBtn: document.getElementById('parse-btn'),
    resultCount: document.getElementById('result-count'),
    
    // 工作区
    textContainer: document.getElementById('text-container'),
    detailContainer: document.getElementById('detail-container'),
    
    // 粘贴弹窗
    pasteModal: document.getElementById('paste-modal'),
    pasteModalClose: document.getElementById('paste-modal-close'),
    pasteModalClear: document.getElementById('paste-modal-clear'),
    pasteModalConfirm: document.getElementById('paste-modal-confirm'),
    logText: document.getElementById('log-text'),
};

// 状态
let state = {
    elfUploaded: false,
    toolchainSelected: false,
    toolchains: [],
    selectedToolchain: null,
    parseResults: {},
    originalText: '',
    activeAddress: null,
};

// ===================== 工具函数 =====================

function showStatus(message, type = 'info') {
    const icons = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        loading: '⏳',
    };
    
    elements.statusBar.hidden = false;
    elements.statusBar.className = `status-bar ${type}`;
    elements.statusIcon.textContent = icons[type] || icons.info;
    elements.statusMessage.textContent = message;
    
    if (type === 'success') {
        setTimeout(() => {
            elements.statusBar.hidden = true;
        }, 3000);
    }
}

function hideStatus() {
    elements.statusBar.hidden = true;
}

function updateParseButton() {
    elements.parseBtn.disabled = !(state.elfUploaded && state.toolchainSelected && state.originalText);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===================== 上传处理 =====================

elements.uploadArea.addEventListener('click', () => {
    elements.elfFile.click();
});

elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('dragover');
});

elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('dragover');
});

elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        uploadFile(files[0]);
    }
});

elements.elfFile.addEventListener('change', () => {
    if (elements.elfFile.files.length > 0) {
        uploadFile(elements.elfFile.files[0]);
    }
});

async function uploadFile(file) {
    showStatus('正在上传 ELF 文件...', 'loading');
    
    // 显示进度
    elements.uploadProgress.hidden = false;
    elements.progressFill.style.width = '0%';
    elements.progressText.textContent = '上传中...';
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                elements.progressFill.style.width = percent + '%';
                elements.progressText.textContent = `上传中... ${percent}%`;
            }
        });
        
        const response = await new Promise((resolve, reject) => {
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    try {
                        const err = JSON.parse(xhr.responseText);
                        reject(new Error(err.error || '上传失败'));
                    } catch {
                        reject(new Error('上传失败'));
                    }
                }
            };
            xhr.onerror = () => reject(new Error('网络错误'));
            xhr.open('POST', '/api/upload');
            xhr.send(formData);
        });
        
        // 上传成功
        elements.uploadProgress.hidden = true;
        state.elfUploaded = true;
        
        // 显示 ELF 信息
        displayElfInfo(response.elf_info);
        
        // 更新工具链选择
        if (response.selected_toolchain) {
            state.selectedToolchain = response.selected_toolchain;
            state.toolchainSelected = true;
            displayCurrentToolchain(response.selected_toolchain);
        }
        
        // 加载工具链列表
        await loadToolchains();
        
        showStatus('ELF 文件上传成功', 'success');
        updateParseButton();
        
    } catch (error) {
        elements.uploadProgress.hidden = true;
        showStatus(`上传失败: ${error.message}`, 'error');
    }
}

function displayElfInfo(info) {
    elements.elfInfo.hidden = false;
    elements.elfArch.textContent = info.arch_name || 'Unknown';
    elements.elfBits.textContent = info.bits ? `${info.bits}-bit` : 'Unknown';
    elements.elfEndian.textContent = info.endian_name || 'Unknown';
}

// ===================== 工具链管理 =====================

async function loadToolchains() {
    try {
        const response = await fetch('/api/toolchains');
        const data = await response.json();
        
        state.toolchains = data.toolchains;
        
        // 更新下拉框
        elements.toolchainSelect.innerHTML = '';
        
        if (state.toolchains.length === 0) {
            elements.toolchainSelect.innerHTML = '<option value="">-- 未找到可用工具链 --</option>';
            elements.toolchainSelect.disabled = true;
            return;
        }
        
        // 添加选项
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- 选择工具链 --';
        elements.toolchainSelect.appendChild(defaultOption);
        
        // 按架构分组
        const grouped = {};
        for (const tc of state.toolchains) {
            const arch = tc.arch_name || 'Other';
            if (!grouped[arch]) {
                grouped[arch] = [];
            }
            grouped[arch].push(tc);
        }
        
        for (const [arch, toolchains] of Object.entries(grouped)) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = arch;
            
            for (const tc of toolchains) {
                const option = document.createElement('option');
                option.value = tc.path;
                option.textContent = tc.name;
                
                if (state.selectedToolchain && state.selectedToolchain.path === tc.path) {
                    option.selected = true;
                }
                
                optgroup.appendChild(option);
            }
            
            elements.toolchainSelect.appendChild(optgroup);
        }
        
        elements.toolchainSelect.disabled = false;
        
    } catch (error) {
        console.error('Failed to load toolchains:', error);
        showStatus('加载工具链列表失败', 'error');
    }
}

elements.toolchainSelect.addEventListener('change', async () => {
    const path = elements.toolchainSelect.value;
    
    if (!path) {
        state.toolchainSelected = false;
        state.selectedToolchain = null;
        elements.currentToolchain.hidden = true;
        updateParseButton();
        return;
    }
    
    try {
        showStatus('正在切换工具链...', 'loading');
        
        const response = await fetch('/api/select-toolchain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        state.selectedToolchain = data.selected_toolchain;
        state.toolchainSelected = true;
        
        displayCurrentToolchain(data.selected_toolchain);
        showStatus('工具链已切换', 'success');
        updateParseButton();
        
    } catch (error) {
        showStatus(`切换工具链失败: ${error.message}`, 'error');
    }
});

function displayCurrentToolchain(toolchain) {
    elements.currentToolchain.hidden = false;
    elements.toolchainName.textContent = toolchain.name;
    elements.toolchainPath.textContent = toolchain.path;
}

// ===================== 粘贴弹窗 =====================

elements.pasteBtn.addEventListener('click', () => {
    elements.pasteModal.hidden = false;
    elements.logText.focus();
});

elements.pasteModalClose.addEventListener('click', () => {
    elements.pasteModal.hidden = true;
});

elements.pasteModalClear.addEventListener('click', () => {
    elements.logText.value = '';
    elements.logText.focus();
});

elements.pasteModalConfirm.addEventListener('click', () => {
    state.originalText = elements.logText.value;
    elements.pasteModal.hidden = true;
    
    if (state.originalText.trim()) {
        // 显示原始文本（不带高亮）
        displayOriginalText();
        updateParseButton();
    }
});

elements.pasteModal.addEventListener('click', (e) => {
    if (e.target === elements.pasteModal) {
        elements.pasteModal.hidden = true;
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!elements.pasteModal.hidden) {
            elements.pasteModal.hidden = true;
        }
    }
});

function displayOriginalText() {
    // 先显示纯文本，等解析后再高亮
    elements.textContainer.innerHTML = `<div class="highlighted-text">${escapeHtml(state.originalText)}</div>`;
}

// ===================== 文本解析 =====================

elements.parseBtn.addEventListener('click', parseText);

async function parseText() {
    const text = state.originalText.trim();
    
    if (!text) {
        showStatus('请先粘贴日志文本', 'error');
        return;
    }
    
    showStatus('正在解析地址...', 'loading');
    elements.parseBtn.disabled = true;
    
    try {
        const response = await fetch('/api/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // 存储结果
        state.parseResults = {};
        for (const result of data.results) {
            state.parseResults[result.address.toLowerCase()] = result;
        }
        
        // 显示高亮文本
        displayHighlightedText();
        
        // 更新计数
        const successCount = data.results.filter(r => r.success).length;
        elements.resultCount.textContent = `共 ${data.results.length} 个地址，${successCount} 个成功`;
        
        showStatus(`解析完成: ${successCount}/${data.results.length} 个地址成功`, 'success');
        
    } catch (error) {
        showStatus(`解析失败: ${error.message}`, 'error');
    } finally {
        elements.parseBtn.disabled = false;
        updateParseButton();
    }
}

function displayHighlightedText() {
    const escaped = escapeHtml(state.originalText);
    const highlighted = escaped.replace(/0x[0-9a-fA-F]+/gi, (match) => {
        const result = state.parseResults[match.toLowerCase()];
        const statusClass = result ? (result.success ? 'resolved' : 'failed') : '';
        return `<span class="addr-link ${statusClass}" data-addr="${match}">${match}</span>`;
    });
    
    elements.textContainer.innerHTML = `<div class="highlighted-text">${highlighted}</div>`;
    
    // 绑定点击事件
    elements.textContainer.querySelectorAll('.addr-link').forEach(el => {
        el.addEventListener('click', () => showAddressDetail(el.dataset.addr, el));
    });
}

// ===================== 右侧详情显示 =====================

async function showAddressDetail(address, clickedElement) {
    // 移除之前的 active 状态
    elements.textContainer.querySelectorAll('.addr-link.active').forEach(el => {
        el.classList.remove('active');
    });
    
    // 添加 active 状态
    if (clickedElement) {
        clickedElement.classList.add('active');
    }
    
    state.activeAddress = address;
    
    // 先检查缓存
    let result = state.parseResults[address.toLowerCase()];
    
    if (!result) {
        // 显示加载状态
        elements.detailContainer.innerHTML = `
            <div class="detail-content">
                <div class="detail-item">
                    <label>地址</label>
                    <div class="value address">${escapeHtml(address)}</div>
                </div>
                <div class="detail-item">
                    <label>结果</label>
                    <div class="value">加载中...</div>
                </div>
            </div>
        `;
        
        // 从服务器获取
        try {
            const response = await fetch(`/api/resolve/${encodeURIComponent(address)}`);
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            result = data.result;
            // 缓存结果
            state.parseResults[address.toLowerCase()] = result;
            
        } catch (error) {
            result = {
                address: address,
                result: null,
                success: false,
                error: error.message,
            };
        }
    }
    
    // 显示详情
    displayDetail(result);
}

function displayDetail(result) {
    const statusClass = result.success ? 'success' : 'failed';
    const output = result.result || result.error || '无法解析此地址';
    
    elements.detailContainer.innerHTML = `
        <div class="detail-content">
            <div class="detail-item">
                <label>地址</label>
                <div class="value address">${escapeHtml(result.address)}</div>
            </div>
            <div class="detail-item">
                <label>解析结果</label>
                <div class="value ${statusClass}">${escapeHtml(output)}</div>
            </div>
            <div class="detail-item">
                <label>工具链</label>
                <div class="value">${state.selectedToolchain ? escapeHtml(state.selectedToolchain.name) : 'Unknown'}</div>
            </div>
        </div>
    `;
}

// ===================== 初始化 =====================

async function init() {
    // 加载工具链列表
    await loadToolchains();
    
    // 获取会话信息
    try {
        const response = await fetch('/api/session-info');
        const data = await response.json();
        
        if (data.elf_info) {
            state.elfUploaded = true;
            displayElfInfo(data.elf_info);
        }
        
        if (data.selected_toolchain) {
            state.selectedToolchain = data.selected_toolchain;
            state.toolchainSelected = true;
            displayCurrentToolchain(data.selected_toolchain);
            
            // 更新下拉框选中状态
            elements.toolchainSelect.value = data.selected_toolchain.path;
        }
        
        updateParseButton();
        
    } catch (error) {
        console.error('Failed to load session info:', error);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
