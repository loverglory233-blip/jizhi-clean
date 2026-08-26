# -*- coding: utf-8 -*-
"""
Jizhi (集智) 阿里云一键安装部署脚本
"""
import os, sys

def main():
    print("🚀 [1/4] 正在关闭旧版服务进程...")
    os.system("kill -9 $(lsof -t -i:8088) 2>/dev/null || true")
    os.system("pkill -9 -f 'python3 server.py' 2>/dev/null || true")

    target_dir = "/root/jizhi-clean"
    os.makedirs(os.path.join(target_dir, "css"), exist_ok=True)
    os.makedirs(os.path.join(target_dir, "js"), exist_ok=True)

    print("🚀 [2/4] 正在写入核心文件...")
    
    # 1. index.html
    with open(os.path.join(target_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write('''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>集智 JIZHI - 多智能体协作写作平台</title>
  <link rel="stylesheet" href="css/styles.css">
  <style>
    #app-loading-screen {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: #f8fafc; z-index: 999999; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      transition: opacity 0.25s ease-out;
    }
    .loading-spinner-ring {
      width: 44px; height: 44px; border: 3.5px solid #e2e8f0;
      border-top: 3.5px solid #0284c7; border-radius: 50%;
      animation: spinLoader 0.75s linear infinite;
    }
    @keyframes spinLoader { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="app-loading-screen">
    <div class="loading-spinner-ring"></div>
    <div style="margin-top: 16px; font-weight: 700; color: #0f172a; font-size: 16px;">集智 JIZHI</div>
    <div style="margin-top: 6px; font-size: 13px; color: #64748b; font-weight: 500;">面向团队协作的多智能体人机协同写作平台</div>
  </div>
  <div id="app"></div>
  <script src="js/bundle.js"></script>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        const loader = document.getElementById('app-loading-screen');
        if (loader && loader.style.display !== 'none') {
          loader.style.opacity = '0';
          setTimeout(() => { loader.style.display = 'none'; }, 200);
        }
      }, 100);
    });
  </script>
</body>
</html>''')

    # 2. db_group_1.json
    with open(os.path.join(target_dir, "db_group_1.json"), "w", encoding="utf-8") as f:
        f.write('{"stage1":{"contract":{"isConfirmed":false,"confirmedMembers":{},"timeAllocations":{"background":20,"questions":25,"literature":30,"method":40,"reflection":15,"references":10},"taskAssignments":{}},"mergedTitle":"","proposals":[],"votes":{},"hasVoted":{}},"stage2":{"unifiedContent":"<h2>一、研究背景与意义</h2><p>请在此处撰写正文...</p><h2>二、研究问题与假设</h2><p>请在此处撰写正文...</p><h2>三、文献综述</h2><p>请在此处撰写正文...</p><h2>四、研究设计与方法</h2><p>请在此处撰写正文...</p><h2>五、不足与反思</h2><p>请在此处撰写正文...</p><h2>六、参考文献</h2><p>请在此处撰写正文...</p>","actionPlan":{"isGenerated":false,"items":[]}},"stage3":{"defenseItems":[]},"chatLogs":{"stage1":[],"stage2":[],"stage3":[]}}')

    print("🚀 [3/4] 核心配置文件写入完成...")

if __name__ == '__main__':
    main()
