# Quick Start Guide - Safe Git Workflow

## ✅ Your Repository is Now Protected!

I've set up comprehensive safety measures to prevent:
- 🔒 Secret leaks (API keys, tokens, passwords)
- 💾 Code loss (automatic backup reminders)

---

## 🚀 How to Push Code Safely (Every Time)

### Option 1: Use the Safe Push Script (RECOMMENDED)
```bash
# This script will automatically check for secrets
./scripts/safe-push.sh
```

### Option 2: Manual Steps
```bash
# 1. Check what changed
git status

# 2. Review your code
git diff

# 3. Add your files
git add client/src/pages/dashboard.tsx
git add server/routes.ts
# OR: git add . (to add everything)

# 4. Check for secrets (IMPORTANT!)
./scripts/check-secrets.sh

# 5. If clean, commit
git commit -m "Add new feature to dashboard"

# 6. Push to GitHub
git push -u origin your-branch-name
```

---

## 🔒 Secret Detection (Automatic)

A **pre-commit hook** is now installed that automatically scans for secrets before every commit!

**What it checks:**
- ✅ API keys (OpenAI, WHOOP, etc.)
- ✅ JWT tokens
- ✅ Passwords in code
- ✅ .env files
- ✅ Database URLs with credentials
- ✅ Private keys (.pem, .key files)

**If secrets detected:**
```
❌ SECRETS DETECTED - DO NOT COMMIT!
```

You'll need to:
1. Remove the secret from your code
2. Add it to `.env` file
3. Use `process.env.SECRET_NAME` in code

---

## 📋 Daily Checklist

Every time you code:
1. **Make changes** to your code
2. **Commit often** (every hour or after each feature)
   ```bash
   git add .
   git commit -m "WIP: working on feature X"
   git push
   ```
3. **At end of day**, push everything:
   ```bash
   git push
   ```

---

## 🌳 Working with Branches

### Create a New Branch
```bash
# For new features
git checkout -b claude/my-new-feature-$(date +%s)

# Make changes...
git add .
git commit -m "Add my new feature"
git push -u origin claude/my-new-feature-*
```

### Switch Back to Main
```bash
git checkout main
git pull origin main
```

---

## 🆘 Common Issues

### "I committed a secret by accident!"

**If not pushed yet:**
```bash
# Undo last commit (keep changes)
git reset --soft HEAD~1

# Remove secret from file
# Edit your file and remove the secret

# Recommit without secret
git add .
git commit -m "Your message"
```

**If already pushed:**
```bash
# 1. IMMEDIATELY create a new secret (rotate it)
# 2. Update .env with new secret
# 3. Remove from git
git rm --cached filename
git commit -m "Remove leaked secret"
git push
```

### "I lost my code!"

```bash
# Restore from GitHub
git fetch origin
git reset --hard origin/your-branch-name

# Or see git history
git reflog
git checkout commit-hash-from-reflog
```

### "Pre-commit hook rejected my commit!"

**Check what it found:**
```bash
./scripts/check-secrets.sh
```

**Fix the issues**, then try again.

**Only bypass if you're sure** (like for documentation):
```bash
git commit --no-verify -m "Your message"
```

---

## 📁 Important Files

- **`.env.example`** - Template for environment variables (safe to commit)
- **`.env`** - YOUR actual secrets (NEVER commit this!)
- **`.gitignore`** - Files that should never be in git
- **`IMPORTANT_CLAUDE_INSTRUCTIONS.md`** - Rules for Claude Code
- **`SAFE_GIT_WORKFLOW.md`** - Detailed git guide

---

## 🔧 Setup Your .env File

```bash
# 1. Copy the template
cp .env.example .env

# 2. Edit with your real values
nano .env  # or use your favorite editor

# 3. Verify it's not tracked
git status | grep ".env" && echo "❌ PROBLEM!" || echo "✅ Safe"
```

---

## 💡 Pro Tips

1. **Commit frequently** - Your code only exists locally until pushed!
2. **Use descriptive commit messages** - Future you will thank you
3. **Review before pushing** - Always run `git diff --staged`
4. **Never hardcode secrets** - Use `process.env.SECRET_NAME`
5. **Create branches for experiments** - Easy to discard if needed

---

## 🎯 Quick Commands

```bash
# See what changed
git status

# Review changes
git diff

# Add all changes
git add .

# Commit
git commit -m "Your message"

# Push
git push

# Check for secrets
./scripts/check-secrets.sh

# Safe push (recommended)
./scripts/safe-push.sh

# Create .env from template
cp .env.example .env
```

---

## ✅ You're Protected!

Every commit is now automatically checked for secrets before it's created. You'll never accidentally leak secrets again!

**Just remember:**
- Commit often (every hour)
- Push frequently (at least once per day)
- Never hardcode secrets
- Review changes before pushing

---

**Need help?** Read the detailed guides:
- `SAFE_GIT_WORKFLOW.md` - Complete workflow
- `IMPORTANT_CLAUDE_INSTRUCTIONS.md` - Critical rules for Claude Code
