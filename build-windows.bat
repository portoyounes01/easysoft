@echo off
REM Windows Build Script
REM Run this on your Windows machine to build with full hardware support

echo 🚀 Starting Windows build with hardware support...

echo 📦 Installing dependencies...
npm install

echo 🔨 Building application...
npm run build

echo 📱 Building Electron app...
npm run electron:dist

echo ✅ Build completed! Check dist-electron folder for the executable.
pause
