# Offline Bootstrap System Guide

This enhanced bootstrap system solves the "chicken-and-egg" problem of initializing the POS system when completely offline.

## 🚀 Quick Start

### Online Mode (Traditional)

If you have internet connection and Supabase configured:

```bash
# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Run bootstrap
node bootstrap-admin.cjs
```

### Offline Mode (New!)

If you're installing on a machine without internet or want to start completely offline:

```bash
# Run bootstrap without Supabase credentials
node bootstrap-admin.cjs
```

The script will:

1. Create a `bootstrap-data.json` file with the admin user
2. Copy it to the `public/` directory for app access
3. The app will automatically load this admin when starting offline

## 📋 What Gets Created

### Default Admin Credentials

- **Employee Number**: `ADMIN001`
- **Password**: `admin123`
- **PIN**: `1234`
- **Role**: `admin` (full access)

**⚠️ IMPORTANT**: Change these credentials immediately after first login!

## 🔄 How It Works

### 1. Bootstrap Creation

```bash
node bootstrap-admin.cjs
```

**Online Mode**:

- Checks if Supabase is configured
- Creates admin directly in remote database
- Standard flow

**Offline Mode**:

- Creates `bootstrap-data.json` with admin data
- Copies to `public/bootstrap-data.json` for app access
- No network required

### 2. App Startup

```typescript
// In main.tsx
await loadBootstrapData();
```

The app automatically:

- Checks for `/bootstrap-data.json`
- Loads admin into local IndexedDB if no employees exist
- Marks admin as `needs_push: true` for later sync

### 3. Coming Online

When the app connects to Supabase:

- Background sync pushes the bootstrap admin to remote database
- Conflict resolution ensures data integrity
- Bootstrap data can be safely removed

## 📁 File Structure

```
project/
├── bootstrap-admin.cjs           # Enhanced bootstrap script
├── bootstrap-data.json           # Created in offline mode
├── public/
│   └── bootstrap-data.json       # Copy for app access
└── src/
    ├── main.tsx                  # Updated with bootstrap loader
    └── utils/
        └── bootstrapLoader.ts    # App bootstrap loader
```

## 🛠️ Advanced Usage

### Custom Admin Data

Edit the script to customize admin details:

```javascript
const adminUserData = {
  employee_number: "BOSS001", // Change this
  name: "Store Manager", // Change this
  password_hash: hashPassword("mypassword"), // Change this
  pin: hashPassword("9999"), // Change this
  // ... other fields
};
```

### Multiple Bootstrap Employees

Add more employees to the bootstrap array:

```javascript
const bootstrapData = {
  employees: [
    adminUserData,
    managerUserData, // Add more employees
    cashierUserData,
  ],
  // ...
};
```

### Environment-Specific Bootstrap

```bash
# Development
NODE_ENV=development node bootstrap-admin.cjs

# Production
NODE_ENV=production node bootstrap-admin.cjs
```

## 🔄 Sync Behavior

### Initial Offline Usage

1. Admin logs in with default credentials
2. Creates employees, products, makes sales
3. All data stored locally with `needs_push: true`

### Coming Online

1. Connection detected
2. Push local changes to Supabase
3. Pull any remote changes
4. Resolve conflicts (server authority)
5. Mark all data as synced

### Conflict Resolution

- **Employee conflicts**: Server data wins for existing employees
- **New employees**: Local data pushed to server
- **Timestamps**: Server updated_at takes precedence

## 🚨 Security Considerations

### Change Default Credentials

```typescript
// After first login, immediately:
1. Change admin password
2. Change admin PIN
3. Create proper user accounts
4. Remove bootstrap file
```

### Production Deployment

```bash
# Remove bootstrap data after successful sync
rm bootstrap-data.json
rm public/bootstrap-data.json
```

### Access Control

- Bootstrap admin has full `all` permissions
- Create role-specific accounts after initialization
- Follow principle of least privilege

## 🐛 Troubleshooting

### Bootstrap Not Loading

```javascript
// Check browser console for:
console.log("📥 Bootstrap data found, checking if admin exists...");
```

### Sync Issues

```javascript
// Check sync status:
const { isOnline, isSyncing } = await employeeService.getSyncStatus();
```

### Database Conflicts

```javascript
// Force sync resolution:
await employeeService.forceSync();
```

## 📝 Usage Examples

### Scenario 1: Complete Offline Installation

```bash
# Step 1: On offline machine
node bootstrap-admin.cjs
# Creates bootstrap-data.json and public/bootstrap-data.json

# Step 2: Start app
npm run dev
# App automatically loads admin from bootstrap data

# Step 3: Use system offline
# Login with ADMIN001/admin123
# Create employees, products, make sales

# Step 4: When online later
# All data syncs automatically to Supabase
```

### Scenario 2: Online to Offline

```bash
# Step 1: Online setup
VITE_SUPABASE_URL=your_url VITE_SUPABASE_ANON_KEY=your_key node bootstrap-admin.cjs
# Creates admin in Supabase

# Step 2: Go offline
# System continues working with local data

# Step 3: Come back online
# Automatic bidirectional sync
```

## 🔧 Technical Details

### Bootstrap Data Format

```json
{
  "employees": [
    {
      "id": "uuid",
      "employee_number": "ADMIN001",
      "name": "System Administrator",
      "password_hash": "hashed_password",
      "role": "admin",
      "created_at": "2025-01-01T00:00:00.000Z",
      "needs_push": true
    }
  ],
  "created_at": "2025-01-01T00:00:00.000Z",
  "version": "1.0"
}
```

### App Integration Flow

```typescript
// 1. App starts
await initializeApp();

// 2. Bootstrap loader runs
const bootstrapLoaded = await loadBootstrapData();

// 3. If bootstrap data exists and no local employees
if (bootstrapData && !existingEmployees.length) {
  // Load admin into IndexedDB
  await employeeLocalService.createEmployee(adminData);
}

// 4. App renders normally
// Admin can now login offline
```

### Sync Integration

```typescript
// When connection restored
connectionStatus.subscribe(({ isSupabaseOnline }) => {
  if (isSupabaseOnline) {
    // Push bootstrap admin to server
    await employeeService.performSync();

    // Admin now exists in both local and remote
    // Bootstrap data can be cleaned up
  }
});
```

## 🎯 Benefits

1. **Solves Offline Bootstrap**: Can create admin users completely offline
2. **Zero Configuration**: Works without Supabase credentials for offline mode
3. **Seamless Sync**: Automatic sync when coming online
4. **Backward Compatible**: Existing online installations unchanged
5. **Production Ready**: Includes security and deployment considerations
6. **Developer Friendly**: Clear error handling and documentation

This enhanced system maintains all existing sync capabilities while providing smooth offline-first initialization!
