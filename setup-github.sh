#!/bin/bash

# GitHub Repository Setup for Windows Builds
echo "🔧 Setting up GitHub repository for Windows builds with hardware support..."

# Check if git is initialized
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "📝 Initializing git repository..."
    git init
    echo "✅ Git repository initialized"
fi

# Check if there are any commits
if ! git rev-parse HEAD > /dev/null 2>&1; then
    echo "📦 Creating initial commit..."
    git add .
    git commit -m "Initial commit: POS system with hardware support"
    echo "✅ Initial commit created"
fi

# Check for GitHub remote
if ! git remote -v | grep -q origin; then
    echo ""
    echo "🔗 GitHub repository setup required:"
    echo "1. Create a new repository on GitHub"
    echo "2. Copy the repository URL"
    echo "3. Run: git remote add origin <your-repo-url>"
    echo "4. Run: git push -u origin main"
    echo ""
    echo "Example:"
    echo "   git remote add origin https://github.com/yourusername/yourrepo.git"
    echo "   git push -u origin main"
else
    echo "✅ GitHub remote already configured"
    echo "🚀 Ready to trigger builds!"
    echo ""
    echo "To build Windows executable with hardware support:"
    echo "   ./trigger-github-build.sh"
fi

echo ""
echo "📚 For detailed instructions, see: WINDOWS_BUILD_GUIDE.md"
