# Supabase Authentication Setup for Image Uploads

This guide explains how to properly set up Supabase authentication for employees with inventory management permissions to upload images to cloud storage.

## Overview

The POS system now uses a **dual authentication approach**:

1. **Employee Authentication** - For general POS operations (all employees)
2. **Supabase Authentication** - For cloud storage access (inventory managers only)

## Required Setup Steps

### 1. Add Service Role Key to Environment

Add your Supabase service role key to `.env`:

```bash
# Add this to your .env file
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

You can find this key in your Supabase dashboard under Settings > API.

### 2. Run the Auth User Setup Script

Execute the setup script to create Supabase auth users for employees with inventory access:

```bash
node setup-supabase-auth-users.js
```

This script will:

- Add `auth_id` column to the employees table if needed
- Create Supabase auth users for Admin and Manager employees
- Link the auth users to employee records
- **Skip cashiers** (they don't need cloud storage access)

### 3. Apply Storage Policies

Run the updated SQL in your Supabase SQL Editor:

```sql
-- From supabase_storage_setup.sql
-- This sets up proper authenticated-only storage policies
```

### 4. Test the Implementation

**Admin/Manager Login:**

1. Login with admin (`EMP001`) or manager (`EMP002`) credentials
2. Go to Products page and try to add/edit a product with image
3. Should see **green "Cloud Storage"** indicator when uploading images

**Cashier Login:**

1. Login with cashier (`EMP003`) credentials
2. Try to upload an image (if they have access to products page)
3. Should see **yellow "Local Data (Base64)"** with permission message

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

✅ **UI-level access control** - Only inventory managers can access upload interface  
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
