# Supabase Authentication Integration Plan

## Current Status

- ✅ Created `SupabaseAuthContext.tsx` with dual authentication support
- ✅ Updated `App.tsx` to use new auth context
- 🔄 LoginForm needs dual mode support
- ❌ RLS policies need to be updated to use `auth.uid()`
- ❌ Employee records need to be linked to Supabase auth users (for anyone with `inventory` or `all` access, including cashiers)

## Phase 1: Database Setup for Supabase Auth Integration

### 1.1 Add Supabase Auth ID to Employees Table

```sql
-- Add auth_id column to employees table
ALTER TABLE public.employees
ADD COLUMN auth_id UUID REFERENCES auth.users(id);

-- Create index for faster lookups
CREATE INDEX idx_employees_auth_id ON public.employees(auth_id);
```

### 1.2 Create Auth User Creation Function

```sql
-- Function to create Supabase auth users for employees
CREATE OR REPLACE FUNCTION create_employee_auth_user(
  employee_uuid UUID,
  employee_email TEXT,
  employee_password TEXT
) RETURNS UUID AS $$
DECLARE
  auth_user_id UUID;
BEGIN
  -- Insert into auth.users (this is simplified - actual implementation depends on Supabase)
  -- In practice, you'd use Supabase admin API or Auth Admin extension

  -- Update employee record with auth_id
  UPDATE public.employees
  SET auth_id = auth_user_id,
      email = employee_email,
      updated_at = NOW()
  WHERE id = employee_uuid;

  RETURN auth_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Phase 2: Gradual Authentication Migration

### 2.1 Support Both Authentication Methods

- Keep existing employee-based auth working
- Add optional Supabase auth for users who have been migrated
- Allow users to migrate their accounts gradually

### 2.2 LoginForm Updates

```tsx
// Add authentication mode toggle
const [authMode, setAuthMode] = useState<"employee" | "supabase">("employee");

// Support both login methods
const handleSubmit = async (e: React.FormEvent) => {
  if (authMode === "employee") {
    await signInWithEmployeeCredentials(employeeNumber, password);
  } else {
    await signInWithEmailAndPassword(email, password);
  }
};
```

## Phase 3: RLS Policy Implementation

### 3.1 Apply Secure RLS Policies

Execute `secure_rls_policies.sql` to replace the permissive policies with role-based access control.

### 3.2 Test Authentication Flow

1. Create test Supabase auth users
2. Link them to employee records
3. Verify RLS policies work correctly
4. Test offline/online sync behavior

## Phase 4: Complete Migration

### 4.1 Migrate All Employee Accounts

- Create Supabase auth users for all employees
- Link auth_id to employee records
- Notify employees of new login method

### 4.2 Remove Legacy Authentication

- Remove employee password fields from database
- Update LoginForm to only support Supabase auth
- Remove legacy auth methods from SupabaseAuthContext

## Security Considerations

### Current Vulnerability

The current `comprehensive_rls_fix.sql` makes all policies permissive with `USING(true)`. This is a **CRITICAL SECURITY ISSUE** that allows:

- Any authenticated user to access all data
- No role-based restrictions
- Potential data leaks between employees/roles

### Secure Implementation Requirements

1. **Proper RLS Policies**: Use `auth.uid()` to identify users
2. **Role-Based Access**: Check employee roles for permissions
3. **Data Isolation**: Employees should only see their own transactions (unless admin/manager)
4. **Audit Trail**: Log authentication and authorization events

## Implementation Steps

### Immediate (Today)

1. ✅ Document the security vulnerability
2. ✅ Create secure RLS policies file
3. 🔄 Test dual authentication in LoginForm
4. ❌ Add employee email fields to database

### Next Session

1. Create Supabase auth users for test employees
2. Update RLS policies to use proper authentication
3. Test end-to-end authentication flow
4. Verify offline sync still works

### Future Sessions

1. Migrate all employee accounts
2. Remove legacy authentication
3. Add comprehensive audit logging
4. Performance testing with proper RLS

## Testing Strategy

### Manual Testing

1. Test employee login with legacy system
2. Test Supabase auth login
3. Test role-based access restrictions
4. Test offline sync behavior
5. Test RLS policy enforcement

### Automated Testing

1. Unit tests for authentication functions
2. Integration tests for RLS policies
3. Security tests for unauthorized access
4. Performance tests for query execution with RLS

## Rollback Plan

If authentication migration fails:

1. Revert to `comprehensive_rls_fix.sql` (insecure but functional)
2. Remove auth_id column from employees table
3. Use legacy AuthContext instead of SupabaseAuthContext
4. Address security issues in future iteration

## Notes

- The current system works but is completely insecure
- Employee-based authentication provides better UX for POS system
- Supabase auth provides better security and integration
- Dual authentication allows gradual migration
- RLS policies are critical for data security
