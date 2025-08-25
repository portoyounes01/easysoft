# Supabase Authentication Setup for Image Uploads

This guide explains how to properly set up Supabase authentication for any employees whose access includes inventory management (access level `inventory` or `all`) to upload images to cloud storage.

## Overview

The POS system now uses a **dual authentication approach**:

1. **Employee Authentication** - For general POS operations (all employees)
2. **Supabase Authentication** - For cloud storage access (any employee with `inventory` or `all` access)

## Required Setup Steps

### 1. Add Service Role Key to Environment

Add your Supabase environment values:

```bash
# App runtime (root .env)
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# Provisioning script (supabase/.env)
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

You can find these keys in your Supabase dashboard under Settings > API. The script will automatically load both `.env` files (root `.env` and `supabase/.env`). The script now verifies the presence of the `auth_id` column (does not attempt to create it over REST). If missing, it prints the SQL you need to run.

### 2. Run the Auth User Setup Script

Execute the setup script to create Supabase auth users for employees with inventory/all access:

```bash
node setup-supabase-auth-users.js
```

This script will:

- Add `auth_id` column to the employees table if needed
- Auto-detect employees whose `access_levels` include `inventory` or `all` (role-agnostic, includes cashiers)
- Create Supabase auth users and link them to employee records via `auth_id`
- Password provisioning:
  - Use `PROVISION_PASSWORD_SOURCE=PIN` to attempt using the employee PIN when it looks like plaintext numeric (not a hash), otherwise fallback
  - Set `DEFAULT_SUPABASE_PASSWORD=ChangeMe123!` (or your own) for fallback or when using `PROVISION_PASSWORD_SOURCE=FIXED` (default)

### 3. Apply Storage Policies

Run the updated SQL in your Supabase SQL Editor:

```sql
-- From supabase_storage_setup.sql
-- This sets up proper authenticated-only storage policies
```

### 4. Test the Implementation

**Inventory-enabled Employee Login (any role):**

1. Login with admin (`EMP001`) or manager (`EMP002`) credentials
2. Go to Products page and try to add/edit a product with image
3. Should see **green "Cloud Storage"** indicator when uploading images

If a cashier does not have `inventory` access, the app will not attempt Supabase auth and image uploads will fall back to base64/local behavior.

## How It Works

### Authentication Flow

1. **Employee logs in** with employee credentials (normal POS login)
2. **If employee has inventory access:**
   - System also authenticates with Supabase using their email/password
   - This creates a Supabase session for cloud storage access
3. **If employee doesn't have inventory access:**
   - Only employee authentication (no Supabase session)
   - Image uploads automatically fall back to base64

### Storage Logic

```typescript
// Permission check happens at UI level - who can access ProductForm/ImageUploader

// In ImageUploader component - assumes user already has inventory access:
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) {
  // No Supabase auth -> base64 fallback (technical issue)
  throw new Error("Supabase authentication required for cloud storage");
}

// Upload to Supabase Storage (proper cloud storage)
```

## Security Features

✅ **UI-level access control** - Only employees with inventory access can access upload interface  
✅ **Proper Supabase authentication** - Uses real auth users, not service keys  
✅ **RLS policies enforced** - Database-level security for storage  
✅ **Technical fallback only** - Base64 storage only for server/network issues  
✅ **Clear feedback** - UI shows exactly what storage method is used and why

## Employee Access Levels

| Employee        | Role    | Upload Interface | Cloud Storage | Fallback Reason |
| --------------- | ------- | ---------------- | ------------- | --------------- |
| Carlos (EMP001) | Admin   | ✅               | ✅            | Network only    |
| João (EMP002)   | Manager | ✅               | ✅            | Network only    |
| Maria (EMP003)  | Cashier | ❌               | ❌            | No UI access    |

## Troubleshooting

### "Supabase authentication required" Error

- Employee has inventory permission and UI access but no Supabase auth account
- Run `setup-supabase-auth-users.js` to create missing accounts
- Check that employee has valid email in database

### Base64 Storage Used

- **Expected**: When Supabase is down or network issues
- **Unexpected**: If this happens with good internet, check Supabase service status
- All users with inventory access should normally get cloud storage

### Storage Upload Fails

- Check Supabase storage policies are applied correctly
- Verify the `product-images` bucket exists and is public
- Check network connectivity to Supabase

## Production Considerations

- **Rotate service role key** regularly
- **Use strong passwords** for Supabase auth accounts
- **Monitor storage usage** and costs
- **Set up proper backup** for base64 images
- **Consider image CDN** for better performance

The system is now properly secured with real authentication while maintaining usability for all employee types!
