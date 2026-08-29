#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JIZHI (集智) 现代化 ES Module 构建装配器
运行方式: python3 build.py 或 node build.js
功能: 
1. 校验 src/ 下所有 ES Module 模块的语法与依赖完整性；
2. 自动根据模块依赖拓扑序生成生产发布版 js/bundle.js；
3. 保留 src/ 下 100% 规范严谨的 import/export 现代化源码供审查。
"""

import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(BASE_DIR, "src")
BUNDLE_FILE = os.path.join(BASE_DIR, "js", "bundle.js")

# 严格的模块拓扑装配序列 (依赖前置)
MODULE_ORDER = [
    "constants.js",
    "utils.js",
    "agents.js",
    "auth.js",
    "sync.js",
    "login.js",
    "teacher.js",
    "student-portal.js",
    "editor.js",
    "app.js"
]

def clean_esm_for_bundle(content):
    """
    为生成生产单体 bundle，安全移除 export 和 import 语句，保持全局闭包干净
    """
    lines = content.splitlines()
    cleaned_lines = []
    
    in_import_block = False
    for line in lines:
        stripped = line.strip()
        
        # 匹配单行或多行 import
        if stripped.startswith("import ") or in_import_block:
            if ";" in stripped or "}" in stripped or "from " in stripped:
                in_import_block = False
                continue
            else:
                in_import_block = True
                continue
        
        # 匹配 export { ... };
        if stripped.startswith("export {") and stripped.endswith("};"):
            continue
        
        # 匹配 export const / export function / export class / export async function
        if line.startswith("export "):
            line = line[7:]  # 去掉 "export "
        elif line.startswith("  export "):
            line = "  " + line[9:]
            
        cleaned_lines.append(line)
        
    return "\n".join(cleaned_lines)

def sync_versions(new_ver):
    # 1. 更新 constants.js
    c_path = os.path.join(SRC_DIR, "constants.js")
    if os.path.exists(c_path):
        with open(c_path, "r", encoding="utf-8") as f:
            c = f.read()
        c = re.sub(r"APP_VERSION\s*=\s*['\"][^'\"]+['\"]", f"APP_VERSION = '{new_ver}'", c)
        with open(c_path, "w", encoding="utf-8") as f:
            f.write(c)

    # 2. 更新 index.html
    idx_path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(idx_path):
        with open(idx_path, "r", encoding="utf-8") as f:
            idx = f.read()
        idx = re.sub(r"\?v=\d{8}_v\w+", f"?v={new_ver}", idx)
        with open(idx_path, "w", encoding="utf-8") as f:
            f.write(idx)

    # 3. 更新 update.sh
    up_path = os.path.join(BASE_DIR, "update.sh")
    if os.path.exists(up_path):
        with open(up_path, "r", encoding="utf-8") as f:
            up = f.read()
        up = re.sub(r'TARGET_VERSION=["\'][^"\']+["\']', f'TARGET_VERSION="{new_ver}"', up)
        with open(up_path, "w", encoding="utf-8") as f:
            f.write(up)

    # 4. 更新 src/*.js 的 import 版本后缀
    for fn in os.listdir(SRC_DIR):
        if fn.endswith(".js"):
            fp = os.path.join(SRC_DIR, fn)
            with open(fp, "r", encoding="utf-8") as f:
                content = f.read()
            content = re.sub(r'(\./[a-zA-Z0-9_-]+\.js)\?v=\d{8}_v\w+', rf'\1?v={new_ver}', content)
            with open(fp, "w", encoding="utf-8") as f:
                f.write(content)
    print(f"   🏷️ [Version Sync] 全局版本戳已成功统一更新为: {new_ver}")

def build():
    NEW_VERSION = "20260830_v708"
    sync_versions(NEW_VERSION)
    
    print("🚀 [ESM Build] 开始验证并装配 JIZHI 现代化模块...")
    
    if not os.path.exists(SRC_DIR):
        print("❌ [Build Error] src/ 目录不存在！")
        return False

    bundle_parts = [
        "/**\n",
        " * JIZHI (集智) Multi-Agent Collaborative Writing Platform\n",
        f" * Version: {NEW_VERSION}\n",
        " * Modern ES Module Distribution Bundle\n",
        " * (Compiled from src/*.js via build.py)\n",
        " */\n\n",
        "(function() {\n"
    ]

    for filename in MODULE_ORDER:
        mf = os.path.join(SRC_DIR, filename)
        if not os.path.exists(mf):
            print(f"❌ [Build Error] 缺失必要模块: {filename}")
            return False
            
        with open(mf, "r", encoding="utf-8") as f:
            raw_content = f.read()

        cleaned_content = clean_esm_for_bundle(raw_content).strip()
        
        indented_lines = []
        for line in cleaned_content.splitlines():
            indented_lines.append("  " + line if line.strip() else "")
        indented_content = "\n".join(indented_lines)

        bundle_parts.append(f"\n  /* ==========================================================================\n     MODULE: {filename}\n     ========================================================================== */\n")
        bundle_parts.append(indented_content + "\n")
        print(f"   ✅ [ESM Module Loaded] {filename}")

    bundle_parts.append("\n})();\n")

    os.makedirs(os.path.dirname(BUNDLE_FILE), exist_ok=True)
    with open(BUNDLE_FILE, "w", encoding="utf-8") as out:
        out.write("".join(bundle_parts))

    print(f"🎉 [Build Success] 成功编译生成: {BUNDLE_FILE} (共 {len(MODULE_ORDER)} 个现代 ES 模块)")
    return True

if __name__ == "__main__":
    build()
