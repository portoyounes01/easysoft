# Windows Build with Hardware Support

## Overview

This project requires native hardware modules (printers, cash drawers, USB devices) that cannot be cross-compiled from macOS to Windows. Therefore, we use GitHub Actions to build on actual Windows runners.

## 🚀 Building for Windows with Full Hardware Support

### Method 1: GitHub Actions (Recommended)

This builds on actual Windows runners with all hardware modules included:

```bash
# Trigger a build with full hardware support
./trigger-github-build.sh
```

Or manually:

```bash
git add .
git commit -m "Trigger Windows build"
git push
```

Then:

1. Go to your GitHub repository
2. Click on the "Actions" tab
3. Monitor the build progress
4. Download the Windows artifacts when complete

### Method 2: Manual GitHub Actions Trigger

You can also trigger builds manually without pushing code:

1. Go to GitHub → Your Repository → Actions
2. Click "Build Cross-Platform" workflow
3. Click "Run workflow" → "Run workflow"

## 📁 Build Outputs

The GitHub Actions build will generate:

- **Windows Installer**: `Comprehensive POS System Setup.exe` (NSIS installer)
- **Windows Portable**: `Comprehensive POS System.exe` (standalone executable)
- **macOS**: `.dmg` file
- **Linux**: `.AppImage` and `.deb` files

## 🔧 Hardware Modules Included

The Windows build includes full support for:

- **Serial Port Communication**: `serialport` for cash drawers
- **USB Device Control**: `usb` for direct USB hardware
- **Thermal Printers**: `escpos` and `escpos-usb` for receipt printing
- **Network Printers**: Full network printing support

## ⚠️ Important Notes

- ❌ **DO NOT** use the local build scripts for Windows if you need hardware support
- ✅ **ALWAYS** use GitHub Actions for production Windows builds
- 🔄 The build process takes ~5-10 minutes on GitHub runners
- 📦 Download artifacts from the Actions tab after build completion

## 🛠 Development Workflow

1. **Develop on macOS**: Use `npm run electron:dev` for development
2. **Test locally**: Use `npm run electron` for macOS testing
3. **Build for Windows**: Push to GitHub to trigger Windows build
4. **Deploy**: Download Windows artifacts and deploy to target machines

## 📋 Build Scripts Reference

```bash
# Development
npm run electron:dev              # Start dev server with Electron
npm run electron                  # Run current build in Electron

# Local builds (macOS/Linux only)
npm run electron:dist            # Build for current platform

# Windows builds (with hardware support)
./trigger-github-build.sh        # Trigger GitHub Actions build
npm run build:github             # Info about GitHub builds

# Manual trigger
git push                         # Any push triggers cross-platform builds
```

## 🔍 Troubleshooting

**Build fails on GitHub Actions?**

- Check the Actions tab for error logs
- Ensure all dependencies are in `package.json`
- Verify Node.js version compatibility

**Hardware not working on Windows?**

- Ensure you downloaded the GitHub Actions build
- Local cross-compiled builds won't have hardware support
- Check Windows device drivers for your hardware

**Need different Windows architecture?**

- Edit `.github/workflows/build.yml`
- Change `arch: ["x64", "ia32"]` to your needs
