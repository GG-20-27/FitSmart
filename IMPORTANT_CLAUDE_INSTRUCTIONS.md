# 🤖 IMPORTANT INSTRUCTIONS FOR CLAUDE CODE

**READ THIS FILE BEFORE MAKING ANY GIT COMMITS OR PUSHES**

---

## ⚠️ CRITICAL RULES - NEVER BREAK THESE

### 1. NEVER COMMIT SECRETS
**Before ANY commit, scan for:**
- API keys
- Passwords
- Tokens (JWT, OAuth, etc.)
- Private keys (.pem, .key files)
- Database credentials
- Environment variables with actual values

**How to check:**
```bash
git diff --staged | grep -iE "(password|secret|key|token|api_key|credential)"
```

**If found, STOP and:**
1. Remove secret from code
2. Move to `.env` file
3. Use `process.env.SECRET_NAME` in code
4. Verify `.env` is in `.gitignore`

---

### 2. COMMIT FREQUENTLY (Every Hour)
**Why?** To prevent code loss during risky operations like:
- Refactoring
- Removing files
- Cleaning up secrets
- Major changes

**How:**
```bash
git add .
git commit -m "WIP: [describe what you're working on]"
git push
```

---

### 3. ALWAYS PUSH TO FEATURE BRANCHES
**Never push directly to main unless explicitly instructed.**

**Correct workflow:**
```bash
# Create branch with claude/ prefix and session ID suffix
git checkout -b claude/feature-name-$(echo $SESSION_ID | tail -c 12)

# Make changes, commit
git add .
git commit -m "Add feature X"

# Push to feature branch
git push -u origin claude/feature-name-*
```

---

### 4. NEVER DELETE FILES WITHOUT COMMITTING FIRST
**Before deleting anything:**
```bash
# 1. Commit current state
git add .
git commit -m "Backup before removing [filename]"
git push

# 2. NOW safe to delete
git rm filename
git commit -m "Remove [filename] - [reason]"
git push
```

---

## 📋 PRE-COMMIT CHECKLIST (Use Every Time)

Run this before EVERY commit:

```bash
# 1. Check what's being committed
git status
git diff --staged

# 2. Scan for secrets
git diff --staged | grep -iE "(password|secret|key|token|api_key|credential)" && echo "❌ SECRETS FOUND - DO NOT COMMIT" || echo "✅ No secrets detected"

# 3. Verify .env not being committed
git diff --staged | grep "\.env$" && echo "❌ .env file found - DO NOT COMMIT" || echo "✅ No .env files"

# 4. Check for sensitive files
git diff --staged --name-only | grep -iE "(secret|password|token|credential|\.pem$|\.key$)" && echo "❌ Sensitive files found" || echo "✅ No sensitive files"
```

**Only proceed if all checks show ✅**

---

## 🔄 STANDARD GIT WORKFLOW

### For Regular Changes:
```bash
# 1. Create feature branch
git checkout -b claude/your-feature-name-session123

# 2. Make changes to code
# ... edit files ...

# 3. Check status
git status

# 4. Review changes
git diff

# 5. RUN SECRET SCAN (MANDATORY)
git diff | grep -iE "(password|secret|key|token)" || echo "✅ Clean"

# 6. Stage changes
git add client/src/file1.ts
git add server/file2.ts
# OR: git add . (only if you're sure)

# 7. Review staged changes
git diff --staged

# 8. RUN SECRET SCAN ON STAGED FILES (MANDATORY)
git diff --staged | grep -iE "(password|secret|key|token)" || echo "✅ Clean"

# 9. Commit
git commit -m "Clear description of changes"

# 10. Push
git push -u origin claude/your-feature-name-session123
```

### For Quick Backups (Work in Progress):
```bash
git add .
git commit -m "WIP: working on [feature name]"
git push
```

---

## 🚨 SECRET DETECTION PATTERNS

**Scan for these patterns before committing:**

```bash
# Comprehensive secret scan
git diff --staged | grep -iE "(
  password\s*=|
  secret\s*=|
  api_key\s*=|
  token\s*=|
  client_secret\s*=|
  private_key\s*=|
  DATABASE_URL\s*=.*postgres|
  mongodb\+srv://|
  sk-[a-zA-Z0-9]{20,}|
  ghp_[a-zA-Z0-9]{36}|
  eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*
)"
```

**Common secret patterns to watch for:**
- `sk-xxxxx` (OpenAI API keys)
- `ghp_xxxxx` (GitHub personal access tokens)
- `eyJxxx.xxx.xxx` (JWT tokens)
- `postgres://user:password@host/db`
- `mongodb+srv://user:password@cluster`
- Any base64 encoded strings > 20 chars after `=`
- Any string with `secret`, `password`, `key`, `token` in variable name

---

## 📁 FILES TO NEVER COMMIT

**Always in .gitignore:**
- `.env`
- `.env.local`
- `.env.*.local`
- `*.pem`
- `*.key`
- `*.cert`
- `credentials.json`
- `secrets.json`
- `*secret*`
- `*token*`
- `*password*`
- `jwt_token.txt`

**If found in git:**
```bash
# Remove from git, keep locally
git rm --cached filename
git commit -m "Remove [filename] from repository"
echo "filename" >> .gitignore
git add .gitignore
git commit -m "Add [filename] to .gitignore"
git push
```

---

## 🛡️ COMMIT FREQUENCY RULES

**Commit at these intervals:**
1. **Every hour** - Regular work
2. **Before any risky operation** - Refactoring, deletions, major changes
3. **Before secret removal** - CRITICAL!
4. **After completing a feature** - Finished work
5. **End of coding session** - Before stopping work

**Why?** Your code only exists in one place locally. If you delete it, it's gone forever. Once pushed to GitHub, it's recoverable.

---

## ⚡ QUICK SAFETY COMMANDS

```bash
# 1. Quick secret scan
git diff | grep -iE "(secret|password|key|token)"

# 2. See what will be committed
git diff --staged --name-only

# 3. Check if .env is staged
git diff --staged --name-only | grep ".env"

# 4. Remove file from staging (undo git add)
git restore --staged filename

# 5. Backup current work
git stash save "Backup $(date)"

# 6. Quick commit + push
git add . && git commit -m "WIP: backup" && git push
```

---

## 🔴 EMERGENCY PROCEDURES

### If You Accidentally Committed a Secret:

**Option 1: Not pushed yet**
```bash
# Remove from last commit
git reset --soft HEAD~1
# Remove secret from file
# Re-commit without secret
git add .
git commit -m "Your message"
```

**Option 2: Already pushed**
```bash
# 1. IMMEDIATELY ROTATE THE SECRET (create new one)
# 2. Update .env with new secret
# 3. Remove from git
git rm --cached filename
git commit -m "Remove leaked secret"
git push

# 4. If in commit history, use BFG Repo-Cleaner
# WARNING: This is advanced, ask for help first
```

### If You Lost Code Locally:
```bash
# Restore from GitHub
git fetch origin
git reset --hard origin/your-branch-name

# Or see reflog (git time machine)
git reflog
git checkout abc1234  # commit hash from reflog
```

---

## 📊 COMMIT MESSAGE FORMAT

**Good format:**
```
[Type]: [Short description]

[Optional longer description explaining why]

[Optional list of changes]
- Change 1
- Change 2
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code refactoring
- `docs:` Documentation
- `style:` Formatting
- `test:` Tests
- `chore:` Maintenance

**Examples:**
```bash
git commit -m "feat: Add FitScore calculation endpoint

- Implement POST /api/ai/fitscore
- Add FitScore components breakdown
- Calculate final score from sleep, recovery, nutrition, strain"

git commit -m "fix: Remove leaked JWT token from repository"

git commit -m "WIP: Implementing meal analysis service"
```

---

## 🎯 SPECIFIC SCENARIOS

### Scenario 1: Adding New Feature
```bash
# 1. Create branch
git checkout -b claude/new-feature-123

# 2. Work on feature
# ... make changes ...

# 3. Commit frequently (every hour)
git add .
git commit -m "WIP: Adding new feature"
git push

# 4. When done
git add .
git commit -m "feat: Complete new feature implementation"
git push
```

### Scenario 2: Removing Old Code
```bash
# 1. BACKUP FIRST (CRITICAL!)
git add .
git commit -m "Backup before removing deprecated code"
git push

# 2. Remove code
git rm old-file.ts

# 3. Commit removal
git commit -m "refactor: Remove deprecated authentication code"
git push
```

### Scenario 3: Fixing Secret Leak
```bash
# 1. BACKUP CURRENT STATE
git add .
git commit -m "Backup before secret removal"
git push

# 2. Remove secret from code
# Edit file, move secret to .env

# 3. Verify .env in .gitignore
cat .gitignore | grep "\.env"

# 4. Remove leaked file if needed
git rm --cached jwt_token.txt

# 5. Commit fix
git commit -m "fix: Move secrets to environment variables"
git push

# 6. ROTATE THE SECRET (generate new one)
```

---

## 🔍 VERIFICATION COMMANDS

**Before pushing, verify:**
```bash
# 1. No secrets in staged changes
git diff --staged | grep -iE "(secret|password|key|token)" && echo "❌ STOP" || echo "✅ OK"

# 2. No .env files
git diff --staged --name-only | grep "\.env" && echo "❌ STOP" || echo "✅ OK"

# 3. No large files
git diff --staged --stat | grep "[0-9]\{4,\}" && echo "⚠️ Large files detected"

# 4. Check branch name
git branch --show-current

# All ✅? Safe to push!
```

---

## 📞 WHEN TO ASK FOR HELP

Ask user before:
1. Deleting large amounts of code
2. Force pushing (`git push --force`)
3. Modifying git history
4. Removing files from repository
5. Any operation that says "WARNING" or "DANGEROUS"

---

## ⏰ AUTOMATION REMINDERS

**Set these reminders:**
- Every hour: "Commit your work-in-progress"
- Before any deletion: "Did you commit a backup first?"
- Before any push: "Did you scan for secrets?"
- End of session: "Push all commits to GitHub"

---

## 📖 REFERENCE FILES

- `SAFE_GIT_WORKFLOW.md` - Detailed git workflow
- `.gitignore` - Files to never commit
- `.env.example` - Template for environment variables
- `recovered/README.md` - Documentation on code recovery

---

**Last updated:** November 15, 2025
**Purpose:** Prevent code loss and secret leaks
**Read before:** EVERY commit and push operation
