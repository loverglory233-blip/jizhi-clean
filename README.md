# 集智 (JIZHI) - 多智能体支持的协作写作平台 (全新纯净版)

这是一个基于 **SSRL（共享调节学习）理论** 设计的多智能体支持在线协作写作平台。本版本已彻底移除所有硬编码预设示例，支持全流程真实的教学实验与协作互动。

---

## 🛠️ 如何在 VS Code 中打开与运行

项目文件夹绝对路径：
`/Users/yun/Desktop/jizhi-clean`

### 方式 1：一键启动 Python 极速服务器（最推荐 ⚡）
1. 在 VS Code 的终端或系统终端中进入该文件夹：
   ```bash
   cd /Users/yun/Desktop/jizhi-clean
   python3 server.py
   ```
2. 浏览器直接访问 `http://localhost:8088` 即可！

---

### 方式 2：使用 VS Code Live Server 插件
1. 在 VS Code 中点击菜单栏 **文件 (File) -> 打开文件夹 (Open Folder...)**，选择 `jizhi-clean`。
2. 在左侧文件列表中右键 **`index.html`**，选择 **"Open with Live Server"**。
3. 浏览器会自动打开网页进入平台！

---

## 📁 目录结构说明

```
jizhi-clean/
├── .vscode/               # VS Code 专属配置文件
│   ├── launch.json        # 快捷调试运行配置
│   └── settings.json      # Live Server 端口及格式化配置
├── css/
    └── styles.css         # 极简清新 UI 样式表
├── js/
│   ├── agents.js          # 6 大学术智能体支架与导引规则
│   ├── app.js             # 主控制器（驱动全流程交互与实时同步）
│   ├── auth.js            # 账号与数据模型管理
│   ├── login.js           # 登录注册组件
│   ├── state.js           # 纯净 SSRL 状态树
│   ├── teacher.js         # 教师端管理中心
│   └── ui.js              # 动态交互看板渲染器
├── db_group_1.json        # 服务端快照存储文件
├── index.html             # 应用主入口
├── package.json           # 项目包配置文件
└── server.py              # Python 多线程 SSE 实时同步服务器
```

---

## 💡 内置测试账号（密码均为 123）
- 👩‍🏫 **教师端**：`teacher@jizhi.edu` 或用户名 `teacher`
- 👨‍🎓 **学生A (组长)**：`studentA@jizhi.edu` 或用户名 `liming`
- 👩‍🎓 **学生B (组员)**：`studentB@jizhi.edu` 或用户名 `wangfang`
- 🧑‍🎓 **学生C (组员)**：`studentC@jizhi.edu` 或用户名 `chenqiang`
