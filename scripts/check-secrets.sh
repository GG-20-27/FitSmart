#!/bin/bash
# Secret detection script - Run before every commit

echo "🔍 Scanning for secrets..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SECRETS_FOUND=0

# Check staged changes for common secret patterns
echo "Checking staged changes..."
if git diff --staged | grep -iE "(password|secret|key|token|api_key|credential)" | grep -v ".env.example" | grep -v "SAFE_GIT_WORKFLOW" | grep -v "IMPORTANT_CLAUDE" | grep -v "check-secrets.sh"; then
    echo -e "${RED}❌ WARNING: Potential secrets detected in staged files!${NC}"
    SECRETS_FOUND=1
else
    echo -e "${GREEN}✅ No obvious secrets in staged changes${NC}"
fi

echo ""

# Check for .env files
echo "Checking for .env files..."
if git diff --staged --name-only | grep -E "^\.env$|\.env\."; then
    echo -e "${RED}❌ WARNING: .env file detected in staged changes!${NC}"
    SECRETS_FOUND=1
else
    echo -e "${GREEN}✅ No .env files in staged changes${NC}"
fi

echo ""

# Check for common secret file patterns
echo "Checking for secret files..."
if git diff --staged --name-only | grep -iE "(secret|password|token|credential|\.pem$|\.key$|\.cert$)"; then
    echo -e "${RED}❌ WARNING: Sensitive files detected!${NC}"
    SECRETS_FOUND=1
else
    echo -e "${GREEN}✅ No sensitive files detected${NC}"
fi

echo ""

# Check for JWT tokens
echo "Checking for JWT tokens..."
if git diff --staged | grep -E "eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*"; then
    echo -e "${RED}❌ WARNING: JWT token detected!${NC}"
    SECRETS_FOUND=1
else
    echo -e "${GREEN}✅ No JWT tokens detected${NC}"
fi

echo ""

# Check for API keys
echo "Checking for API keys..."
if git diff --staged | grep -E "sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}"; then
    echo -e "${RED}❌ WARNING: API key detected!${NC}"
    SECRETS_FOUND=1
else
    echo -e "${GREEN}✅ No API keys detected${NC}"
fi

echo ""
echo "================================================"

if [ $SECRETS_FOUND -eq 1 ]; then
    echo -e "${RED}❌ SECRETS DETECTED - DO NOT COMMIT!${NC}"
    echo ""
    echo "Please:"
    echo "1. Remove secrets from your code"
    echo "2. Move them to .env file"
    echo "3. Use process.env.SECRET_NAME in code"
    echo "4. Verify .env is in .gitignore"
    echo ""
    echo "To bypass (NOT recommended): git commit --no-verify"
    exit 1
else
    echo -e "${GREEN}✅ All checks passed - Safe to commit!${NC}"
    exit 0
fi
