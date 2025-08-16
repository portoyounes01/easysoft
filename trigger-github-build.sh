#!/bin/bash

# GitHub Actions Build Trigger Script
# This script helps you trigger builds with full hardware support on GitHub's runners

echo "🚀 Building Windows executable with FULL hardware support using GitHub Actions"
echo ""
echo "This will:"
echo "✅ Include ALL hardware modules (serialport, usb, escpos, etc.)"
echo "✅ Build on actual Windows runners"
echo "✅ Generate proper Windows installers"
echo "✅ Support all printer and cash drawer hardware"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ This is not a git repository. Please initialize git first:"
    echo "   git init"
    echo "   git add ."
    echo "   git commit -m 'Initial commit'"
    echo "   git remote add origin <your-github-repo-url>"
    echo "   git push -u origin main"
    exit 1
fi

# Check if we have a remote
if ! git remote -v | grep -q origin; then
    echo "❌ No GitHub remote found. Please add your GitHub repository:"
    echo "   git remote add origin <your-github-repo-url>"
    exit 1
fi

echo "📝 Current git status:"
git status --short

echo ""
read -p "🤔 Do you want to commit and push to trigger the build? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 Adding all changes..."
    git add .
    
    echo "💾 Committing changes..."
    git commit -m "Trigger Windows build with hardware support - $(date)"
    
    echo "🚀 Pushing to GitHub to trigger build..."
    git push
    
    echo ""
    echo "✅ Build triggered! Check your GitHub repository:"
    echo "   → Go to Actions tab to monitor build progress"
    echo "   → Windows build will include ALL hardware modules"
    echo "   → Download artifacts when build completes"
    echo ""
    echo "🔗 Quick links:"
    REPO_URL=$(git remote get-url origin | sed 's/\.git$//')
    echo "   Actions: $REPO_URL/actions"
    echo "   Releases: $REPO_URL/releases"
else
    echo "❌ Build not triggered. Run this script again when ready."
fi
