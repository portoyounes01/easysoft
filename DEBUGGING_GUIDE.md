# POS System Debugging Guide

## Quick Fix Instructions

If you're experiencing "same shit.... same error" issues, follow these steps:

### Step 1: Open Browser Developer Tools

1. Open the app at http://localhost:5173
2. Press `F12` or right-click → "Inspect" to open DevTools
3. Go to the **Console** tab

### Step 2: Run Automatic Diagnostics

The app now automatically runs diagnostics when it loads. Look for these messages in the console:

```
🗄️ Database Diagnostics
🧪 POS Test utilities loaded!
```

### Step 3: Use Built-in Debugging Tools

#### Quick Database Check

```javascript
POSTests.quickTest();
```

#### Run Full Diagnostic

```javascript
POSTests.diagnostics();
```

#### Auto-Fix Database Issues

```javascript
POSTests.fixDatabase();
```

#### Populate Sample Data (if database is empty)

```javascript
POSTests.populateData();
```

#### Run Complete Test Suite

```javascript
POSTests.runTests();
```

### Step 4: Manual Database Reset (if needed)

If auto-fix doesn't work:

1. In DevTools, go to **Application** tab
2. Find **IndexedDB** in the sidebar
3. Expand it and find "POSDatabase"
4. Right-click → "Delete database"
5. Refresh the page

Alternatively, run in console:

```javascript
indexedDB.deleteDatabase("POSDatabase").onsuccess = () => location.reload();
```

## Common Issues and Solutions

### 1. "Object Store Not Found" Error

**Symptoms:** Database schema errors, "NotFoundError" in console
**Solution:**

- Run `POSTests.fixDatabase()`
- If that fails, reset database manually

### 2. Empty Database

**Symptoms:** No employees, categories, or products visible
**Solution:**

- Run `POSTests.populateData()` to add sample data
- Or visit Employees page and add data manually

### 3. Login Issues

**Symptoms:** Can't log in with admin/demo users
**Solution:**

1. Run `POSTests.populateData()` first
2. Use these default credentials:
   - Admin: `ADM001` / `password`
   - Manager: `MGR001` / `1234` (PIN)
   - Cashier: `CSH001` / `1234` (PIN)

### 4. Context/Service Initialization Errors

**Symptoms:** "Failed to initialize" errors in console
**Solution:**

- Check console for specific error messages
- Run `POSTests.runTests()` to identify failing components
- Reset database if needed

## Enhanced Debug Features

The app now includes several debugging enhancements:

### 1. Automatic Diagnostics

- Runs on every page load
- Shows database health status
- Identifies common issues

### 2. Enhanced Database Reset Component

- Appears automatically when database issues are detected
- Provides auto-fix button
- Shows detailed diagnostic information

### 3. Comprehensive Test Suite

- Tests all major system components
- Provides detailed error reporting
- Available via browser console

### 4. Debug Utilities

All debug functions are available in the browser console:

```javascript
// Quick health check
POSTests.quickTest();

// Full diagnostics with detailed info
POSTests.diagnostics();

// Auto-fix common issues
POSTests.fixDatabase();

// Add sample data if database is empty
POSTests.populateData();

// Run comprehensive test suite
POSTests.runTests();
```

## Development Debugging

For development issues:

### Check Build

```bash
npm run build
```

### Check TypeScript

```bash
npx tsc --noEmit
```

### Check Linting

```bash
npm run lint
```

### Environment Variables

Ensure `.env` file exists with valid Supabase credentials:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON=your_anon_key
```

## Browser Compatibility

The app requires:

- Modern browser with IndexedDB support
- JavaScript enabled
- Local storage access

Tested browsers:

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Getting Help

1. **Check Console First:** Always open DevTools and check for error messages
2. **Run Diagnostics:** Use `POSTests.diagnostics()` for detailed information
3. **Try Auto-Fix:** Use `POSTests.fixDatabase()` for common issues
4. **Reset as Last Resort:** Manual database reset when all else fails

## Files Modified for Debugging

The following files have been enhanced with debugging capabilities:

- `src/utils/debugDatabase.ts` - Database diagnostics and repair
- `src/utils/testScript.ts` - Comprehensive test suite
- `src/components/DatabaseReset.tsx` - Enhanced reset component
- `src/main.tsx` - Auto-loads debugging utilities
- Database schema includes error detection and recovery

All changes are backward compatible and won't affect normal operation.
