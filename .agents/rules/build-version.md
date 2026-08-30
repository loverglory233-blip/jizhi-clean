---
trigger: always_on
---

# jizhi-clean 版本号强制更新规则

每次对 jizhi-clean 项目的任何源代码文件进行修改后，必须严格按顺序执行以下三步，不得遗漏：

1. **递增版本号**：修改 `build.py` 第 107 行的 `NEW_VERSION`，格式为 `YYYYMMDD_vNNN`，在上一个版本号基础上 +1（例如 `v795` → `v796`）。
2. **重新构建**：运行 `python3 /Users/yun/Desktop/jizhi-clean/build.py`，确认输出 `🎉 [Build Success]` 后才算完成。
3. **Git 推送**：执行 `git add -A && git commit -m "..." && git push`，commit message 须包含版本号。

> 禁止在没有执行上述三步的情况下结束一次代码修改任务。
