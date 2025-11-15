# Safe Git Workflow - Prevent Code Loss & Secret Leaks

## 🚨 Daily Workflow (Follow These Steps Every Time)

### Step 1: Check What Changed (Before Committing)
```bash
# See what files changed
git status

# See actual code changes
git diff

# Check for any secrets or sensitive data
git diff | grep -iE "(password|secret|key|token|api_key|credential)"
```

**⚠️ STOP if you see any secrets!** Remove them before proceeding.

---

### Step 2: Stage Your Changes (Selectively)
```bash
# Add specific files only (RECOMMENDED)
git add client/src/pages/dashboard.tsx
git add server/routes.ts

# OR add all changes (RISKY - use with caution)
git add .
```

**🛡️ Safety Check:**
```bash
# Review what will be committed
git diff --staged

# Check staged files for secrets
git diff --staged | grep -iE "(password|secret|key|token|api_key)"
```

---

### Step 3: Commit Your Changes
```bash
git commit -m "Add FitScore feature to dashboard

- Implement FitScore calculation endpoint
- Add FitScore visualization to web dashboard
- Update mobile app with FitScore Pulse Ring"
```

**✅ Good Commit Messages:**
- Clear and descriptive
- Explain WHAT and WHY
- Use present tense ("Add" not "Added")

**❌ Bad Commit Messages:**
- "fix"
- "update"
- "changes"

---

### Step 4: Push to GitHub (Safely)
```bash
# Push to your feature branch (RECOMMENDED)
git push -u origin your-branch-name

# OR push to main (only if you're sure)
git push origin main
```

**If push fails with 403 error:**
- Make sure branch starts with `claude/` and ends with session ID
- Or create a new branch: `git checkout -b claude/your-feature-name-$(date +%s)`

---

## 🔒 Secret Detection & Prevention

### Install Pre-Commit Hook (One-Time Setup)
```bash
# Install detect-secrets (Python required)
pip install detect-secrets

# Initialize baseline
detect-secrets scan > .secrets.baseline

# Install pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
echo "🔍 Scanning for secrets..."

# Check for common secret patterns
if git diff --cached | grep -iE "(password|secret|key|token|api_key|credential)" | grep -v ".env.example" | grep -v "SAFE_GIT_WORKFLOW.md"; then
    echo "❌ WARNING: Potential secrets detected in staged files!"
    echo "Review your changes and remove any secrets before committing."
    echo ""
    echo "Detected patterns:"
    git diff --cached | grep -iE "(password|secret|key|token|api_key|credential)" | grep -v ".env.example"
    echo ""
    echo "To bypass this check (NOT recommended): git commit --no-verify"
    exit 1
fi

echo "✅ No secrets detected"
exit 0
EOF

chmod +x .git/hooks/pre-commit
```

---

### Manual Secret Check (Before Every Push)
```bash
# Scan current changes for secrets
git diff | grep -iE "(password|secret|key|token|api_key|credential|oauth)"

# Scan staged changes
git diff --staged | grep -iE "(password|secret|key|token|api_key|credential|oauth)"

# Search entire codebase for hardcoded secrets
grep -r --exclude-dir=node_modules --exclude-dir=.git \
  -iE "(password|secret|key|token|api_key).*=.*['\"][^'\"]{20,}" .
```

**If secrets found:**
1. Remove them from code
2. Move to `.env` file
3. Add `.env` to `.gitignore` (already done)
4. Use `process.env.SECRET_NAME` in code

---

## 🔄 Complete Safe Push Workflow

```bash
# 1. Check current status
git status

# 2. Review changes
git diff

# 3. Scan for secrets
git diff | grep -iE "(password|secret|key|token|api_key)" || echo "No secrets detected"

# 4. Stage specific files
git add client/src/pages/dashboard.tsx
git add server/routes.ts

# 5. Review staged changes
git diff --staged

# 6. Commit with good message
git commit -m "Add FitScore feature

- Implement FitScore calculation
- Add visualization components
- Update API endpoints"

# 7. Push to branch
git push -u origin your-branch-name

# 8. Verify push succeeded
git log --oneline -1
```

---

## 🛡️ Prevent Code Loss

### 1. Commit Often (Every Hour or After Each Feature)
```bash
# Commit work-in-progress
git add .
git commit -m "WIP: Adding FitScore calculation logic"
git push
```

**Why?** Even if you make a mistake locally, your code is safe on GitHub.

### 2. Create Branches for Experiments
```bash
# Create branch for risky changes
git checkout -b experiment/remove-old-code

# Make changes...
git add .
git commit -m "Remove deprecated authentication code"
git push -u origin experiment/remove-old-code

# If something breaks, easily switch back
git checkout main
```

### 3. Before Deleting Anything, Commit First
```bash
# BEFORE deleting
git add .
git commit -m "Backup before removing secret"
git push

# NOW safe to delete
git rm jwt_token.txt
git commit -m "Remove leaked JWT token from repository"
git push
```

### 4. Use Stash for Temporary Storage
```bash
# Save current work without committing
git stash save "Work in progress on FitScore"

# Do something else...

# Restore your work
git stash pop
```

---

## 🚨 If You Accidentally Commit Secrets

### Option 1: Remove from Last Commit (If Not Pushed)
```bash
# Remove file from last commit
git rm --cached jwt_token.txt
git commit --amend -m "Remove secret file"

# Add to .gitignore
echo "jwt_token.txt" >> .gitignore
git add .gitignore
git commit -m "Add jwt_token.txt to gitignore"
```

### Option 2: Remove from Git (Keep File Locally)
```bash
# Remove from git but keep locally
git rm --cached jwt_token.txt
git commit -m "Remove jwt_token.txt from repository"

# Add to .gitignore
echo "jwt_token.txt" >> .gitignore
git add .gitignore
git commit -m "Add jwt_token.txt to gitignore"

# Push changes
git push
```

### Option 3: Already Pushed? Rotate Secrets Immediately!
```bash
# 1. ROTATE THE SECRET (generate new one)
# 2. Update .env with new secret
# 3. Remove from git history (advanced)

# Use BFG Repo-Cleaner or git filter-branch
# See: https://rtyley.github.io/bfg-repo-cleaner/
```

**⚠️ Important:** Once a secret is pushed to GitHub, consider it compromised. Rotate it!

---

## 📋 Daily Checklist

Before pushing code:
- [ ] `git status` - Check what changed
- [ ] `git diff` - Review actual changes
- [ ] Scan for secrets in changes
- [ ] `.env` file is in `.gitignore`
- [ ] No hardcoded API keys, passwords, or tokens
- [ ] Commit message is descriptive
- [ ] Pushed to correct branch
- [ ] Code is backed up on GitHub

---

## 🔧 Quick Commands Reference

```bash
# Check what changed
git status
git diff

# Stage changes
git add filename.ts
git add .

# Commit
git commit -m "Descriptive message"

# Push
git push -u origin branch-name

# Create new branch
git checkout -b feature/my-feature

# Scan for secrets
git diff | grep -iE "(secret|password|key|token)"

# Remove file from git (keep locally)
git rm --cached filename.txt

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard all local changes (DANGEROUS!)
git reset --hard HEAD
```

---

## 🎯 Best Practices

1. **Never commit**:
   - `.env` files
   - API keys
   - Passwords
   - Tokens
   - Private keys
   - Database credentials

2. **Always commit**:
   - Source code
   - `.env.example` (template)
   - Documentation
   - Tests
   - Configuration (without secrets)

3. **Use environment variables**:
   ```typescript
   // ❌ BAD
   const apiKey = "sk-1234567890abcdef";

   // ✅ GOOD
   const apiKey = process.env.OPENAI_API_KEY;
   ```

4. **Review before pushing**:
   ```bash
   git diff --staged  # Always review!
   ```

5. **Commit often, push frequently**:
   - Commit every hour or after each feature
   - Push at end of day minimum
   - Your work is only safe when it's on GitHub

---

## 🆘 Emergency Recovery

If you lose code locally:
```bash
# Fetch latest from GitHub
git fetch origin

# Reset to remote state
git reset --hard origin/main

# Or restore specific branch
git checkout origin/your-branch-name
```

If you need old version:
```bash
# See commit history
git log --oneline -20

# Recover file from specific commit
git checkout abc1234 -- path/to/file.ts
```

---

## 📞 Help

If something goes wrong:
1. **DON'T PANIC**
2. Don't run `git reset --hard` (loses local changes)
3. Check `git reflog` (shows all recent operations)
4. Ask for help before doing destructive operations

**Git Reflog** (time machine for git):
```bash
# See all operations (even deleted commits)
git reflog

# Recover lost commit
git checkout abc1234
```
