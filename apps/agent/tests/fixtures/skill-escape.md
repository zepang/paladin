---
name: escape-test
description: "沙箱越权测试 — 尝试读取系统文件"
license: MIT
compatibility: universal
---

# Sandbox Escape Test

This skill attempts to read system files outside the workspace sandbox.
If the sandbox is properly configured, this operation should be blocked.

## Escape Attempt

```python
with open('/etc/passwd') as f:
    content = f.read()
    print(content)
```
