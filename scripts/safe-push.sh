#!/bin/bash
# Safe git push script with automatic checks

echo "🚀 Safe Git Push Script"
echo "======================="
echo ""

# Get branch name
BRANCH=$(git branch --show-current)
echo "Current branch: $BRANCH"
echo ""

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  You have uncommitted changes!"
    echo ""
    git status --short
    echo ""
    read -p "Do you want to commit them first? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        read -p "Enter commit message: " COMMIT_MSG
        git add .

        # Run secret check
        ./scripts/check-secrets.sh
        if [ $? -ne 0 ]; then
            echo "❌ Secret check failed. Aborting commit."
            exit 1
        fi

        git commit -m "$COMMIT_MSG"
    else
        echo "Aborting push. Commit your changes first."
        exit 1
    fi
fi

echo ""
echo "📊 Commits to be pushed:"
git log --oneline origin/$BRANCH..$BRANCH 2>/dev/null || git log --oneline -5
echo ""

read -p "Push to origin/$BRANCH? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Pushing to origin/$BRANCH..."

    # Try to push
    if git push -u origin $BRANCH; then
        echo ""
        echo "✅ Successfully pushed to origin/$BRANCH"
        echo ""
        echo "View your changes:"
        echo "https://github.com/GG-20-27/FitSmart/tree/$BRANCH"
    else
        echo ""
        echo "❌ Push failed!"
        echo ""
        echo "Common fixes:"
        echo "1. Check internet connection"
        echo "2. Verify branch name starts with 'claude/' and ends with session ID"
        echo "3. Try: git pull origin $BRANCH"
        echo "4. Check GitHub authentication"
    fi
else
    echo "Push cancelled."
fi
