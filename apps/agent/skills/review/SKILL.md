---
name: code-review
description: "Comprehensive code review guidance covering security, performance, maintainability, and best practices."
license: MIT
compatibility: universal
---

# Code Review Guidance

A structured checklist for reviewing code changes. Use this skill when asked to review code, pull requests, or patches.

## Review Checklist

### Security

- [ ] Check for hardcoded secrets (API keys, passwords, tokens) — should use environment variables or a secrets manager
- [ ] Verify input validation on all user-supplied data — SQL injection, XSS, command injection vectors
- [ ] Review authentication and authorization logic — is access control correctly enforced?
- [ ] Check for unsafe deserialization (pickle, yaml.load without SafeLoader)
- [ ] Verify file path handling — path traversal risks with user-supplied paths

### Performance

- [ ] Identify N+1 query patterns — are database queries inside loops?
- [ ] Check for unnecessary serialization/deserialization in hot paths
- [ ] Review caching strategy — are expensive computations cached appropriately?
- [ ] Verify large payload handling — streaming vs. loading entire response into memory
- [ ] Check for blocking I/O in async contexts

### Maintainability

- [ ] Naming: functions, variables, classes should clearly describe their purpose
- [ ] Function length: prefer functions under 50 lines; split if logic is complex
- [ ] Single Responsibility: each function/module should do one thing well
- [ ] Comments: explain "why", not "what" — code should be self-documenting where possible
- [ ] Error messages: should be clear, actionable, and not leak internal details

### Best Practices

- [ ] Error handling: exceptions are caught at appropriate levels, not silently swallowed
- [ ] Logging: appropriate log levels (DEBUG for dev, INFO for key events, WARN/ERROR for issues)
- [ ] Type safety: type hints are used consistently; avoid `Any` where possible
- [ ] Testing: critical paths have test coverage; edge cases are considered
- [ ] Dependency management: new dependencies are justified and pinned to specific versions
