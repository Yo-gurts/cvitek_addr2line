"""
ELF 文件解析和工具链匹配模块
"""
import os
import glob
import subprocess
from typing import Dict, List, Optional, Tuple
from elftools.elf.elffile import ELFFile


# ELF 架构常量
EM_ARM = 40
EM_AARCH64 = 183
EM_RISCV = 243

# 架构名称映射
ARCH_NAMES = {
    EM_ARM: 'ARM (32-bit)',
    EM_AARCH64: 'AArch64 (64-bit)',
    EM_RISCV: 'RISC-V',
}

# 架构到工具链前缀的映射
ARCH_PREFIXES = {
    EM_ARM: ['arm-'],
    EM_AARCH64: ['aarch64-'],
    EM_RISCV: ['riscv64-', 'riscv32-'],
}


class ELFInfo:
    """ELF 文件信息"""
    def __init__(self, path: str):
        self.path = path
        self.arch = None
        self.arch_name = 'Unknown'
        self.bits = None
        self.endian = None
        self.endian_name = 'Unknown'
        self.error = None
        
        self._parse()
    
    def _parse(self):
        """解析 ELF 文件头"""
        try:
            with open(self.path, 'rb') as f:
                elf = ELFFile(f)
                self.arch = elf.header['e_machine']
                self.arch_name = ARCH_NAMES.get(self.arch, f'Unknown ({self.arch})')
                
                # 位宽
                ei_class = elf.header['e_ident']['EI_CLASS']
                if ei_class == 'ELFCLASS32':
                    self.bits = 32
                elif ei_class == 'ELFCLASS64':
                    self.bits = 64
                
                # 大小端
                ei_data = elf.header['e_ident']['EI_DATA']
                if ei_data == 'ELFDATA2LSB':
                    self.endian = 'little'
                    self.endian_name = 'Little Endian'
                elif ei_data == 'ELFDATA2MSB':
                    self.endian = 'big'
                    self.endian_name = 'Big Endian'
        except Exception as e:
            self.error = str(e)
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            'path': self.path,
            'arch': self.arch,
            'arch_name': self.arch_name,
            'bits': self.bits,
            'endian': self.endian,
            'endian_name': self.endian_name,
            'error': self.error,
        }


class ToolchainManager:
    """工具链管理器"""
    
    def __init__(self, host_tools_path: str = '/data/cheng.tan/host-tools'):
        self.host_tools_path = host_tools_path
        self.toolchains: List[Dict] = []
        self._scan_toolchains()
    
    def _scan_toolchains(self):
        """扫描可用的工具链"""
        self.toolchains = []
        
        # 查找所有 addr2line 工具
        pattern = os.path.join(self.host_tools_path, 'gcc', '*', 'bin', '*addr2line')
        addr2line_paths = glob.glob(pattern)
        
        for path in sorted(addr2line_paths):
            # 从路径中提取工具链名称
            parts = path.split(os.sep)
            try:
                gcc_idx = parts.index('gcc')
                toolchain_name = parts[gcc_idx + 1]
            except (ValueError, IndexError):
                toolchain_name = os.path.basename(os.path.dirname(os.path.dirname(path)))
            
            # 提取 addr2line 文件名（用于判断架构）
            addr2line_name = os.path.basename(path)
            
            # 判断架构类型
            arch = self._detect_arch_from_name(addr2line_name)
            
            self.toolchains.append({
                'name': toolchain_name,
                'path': path,
                'addr2line_name': addr2line_name,
                'arch': arch,
                'arch_name': ARCH_NAMES.get(arch, 'Unknown') if arch else 'Unknown',
            })
    
    def _detect_arch_from_name(self, name: str) -> Optional[int]:
        """从 addr2line 名称检测架构"""
        name_lower = name.lower()
        if name_lower.startswith('riscv'):
            return EM_RISCV
        elif name_lower.startswith('aarch64'):
            return EM_AARCH64
        elif name_lower.startswith('arm'):
            return EM_ARM
        return None
    
    def get_all_toolchains(self) -> List[Dict]:
        """获取所有可用工具链"""
        return self.toolchains
    
    def find_matching_toolchains(self, elf_info: ELFInfo) -> List[Dict]:
        """根据 ELF 信息查找匹配的工具链"""
        if elf_info.arch is None:
            return []
        
        matching = []
        for tc in self.toolchains:
            if tc['arch'] == elf_info.arch:
                matching.append(tc)
        
        return matching
    
    def get_recommended_toolchain(self, elf_info: ELFInfo) -> Optional[Dict]:
        """获取推荐的工具链"""
        matching = self.find_matching_toolchains(elf_info)
        if matching:
            # 优先选择名称中包含 elf 或 linux 的工具链
            for tc in matching:
                if 'linux' in tc['name'].lower():
                    return tc
            for tc in matching:
                if 'elf' in tc['name'].lower():
                    return tc
            return matching[0]
        return None
    
    def get_toolchain_by_path(self, path: str) -> Optional[Dict]:
        """根据路径获取工具链"""
        for tc in self.toolchains:
            if tc['path'] == path:
                return tc
        return None


class Addr2LineResolver:
    """地址解析器"""
    
    def __init__(self, addr2line_path: str, elf_path: str):
        self.addr2line_path = addr2line_path
        self.elf_path = elf_path
    
    def resolve(self, address: str) -> Dict:
        """解析单个地址"""
        try:
            # 确保地址格式正确
            if not address.startswith('0x'):
                address = '0x' + address
            
            # 调用 addr2line
            cmd = [
                self.addr2line_path,
                '-e', self.elf_path,
                '-f',  # 显示函数名
                '-C',  # demangle C++ 符号
                '-p',  # pretty print
                address
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            output = result.stdout.strip()
            
            # 解析输出
            # 格式通常是: function_name at file:line
            # 或者: ?? at ??:0
            if output:
                return {
                    'address': address,
                    'result': output,
                    'success': '??' not in output,
                    'error': None
                }
            else:
                return {
                    'address': address,
                    'result': None,
                    'success': False,
                    'error': result.stderr.strip() or 'No output'
                }
                
        except subprocess.TimeoutExpired:
            return {
                'address': address,
                'result': None,
                'success': False,
                'error': 'Timeout'
            }
        except Exception as e:
            return {
                'address': address,
                'result': None,
                'success': False,
                'error': str(e)
            }
    
    def resolve_many(self, addresses: List[str]) -> List[Dict]:
        """解析多个地址"""
        results = []
        for addr in addresses:
            results.append(self.resolve(addr))
        return results


def extract_addresses(text: str) -> List[str]:
    """从文本中提取所有十六进制地址"""
    import re
    # 匹配 0x 开头的十六进制地址
    pattern = r'0x[0-9a-fA-F]+'
    matches = re.findall(pattern, text)
    # 去重但保持顺序
    seen = set()
    unique = []
    for addr in matches:
        addr_lower = addr.lower()
        if addr_lower not in seen:
            seen.add(addr_lower)
            unique.append(addr)
    return unique
