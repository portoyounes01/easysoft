# TODO - Future Development Tasks

> 📋 **IMPORTANT**: For security issues and vulnerabilities, see **`SECURITY_ISSUES.md`** - contains a comprehensive security audit with 12 categorized issues requiring attention.

## ⚡️ Current Status: Authentication Integration

### ✅ Completed Today

- [x] **Database Setup Complete** - All tables (employees, products, transactions) successfully created
- [x] **Temporary RLS Fix Applied** - All sync operations now functional (but insecure)
- [x] **Security Documentation** - Comprehensive security analysis documented in `SECURITY_ISSUES.md`
- [x] **Supabase Auth Foundation** - Created `SupabaseAuthContext.tsx` with dual authentication support
- [x] **App Integration Started** - Updated `App.tsx` to use new authentication context
- [x] **Integration Plan Created** - Detailed roadmap in `SUPABASE_AUTH_INTEGRATION_PLAN.md`

### 🔄 In Progress

- [ ] **Authentication Migration** - Currently implementing secure Supabase Auth integration
  - [x] Create SupabaseAuthContext with dual authentication methods
  - [x] Update App.tsx to use new auth context
  - [x] Update LoginForm for backward compatibility
  - [ ] Add email fields to employees table
  - [ ] Create Supabase auth users for test employees
  - [ ] Apply secure RLS policies from `secure_rls_policies.sql`
  - [ ] Test role-based access control
  - [ ] Verify offline sync functionality

## ⚡️ Urgent: Security Vulnerabilities

- [ ] **🚨 CRITICAL: Fix RLS Security Breach** - **IMPLEMENTATION IN PROGRESS**
  - [x] Identified security vulnerability (all policies set to `USING(true)`)
  - [x] Created secure RLS policies in `secure_rls_policies.sql`
  - [x] Implemented dual authentication system
  - [ ] **Next Session**: Apply secure policies and test authentication flow
  - [ ] **Next Session**: Complete Supabase Auth integration
  - [ ] Current state is **FUNCTIONAL BUT COMPLETELY INSECURE** for production use
- [ ] **Address All Security Issues** - Remediate all "CRITICAL" and "HIGH" priority issues outlined in `SECURITY_ISSUES.md`. This includes:
  - [ ] Implement proper password hashing (bcrypt).
  - [ ] Secure session management (e.g., JWTs) and remove sensitive data from `localStorage`.
  - [ ] Implement session timeout.
  - [ ] Move authentication logic to a backend API.

## Critical: Backend Integration

- [ ] **Product Backend Integration**
  - [ ] Create API endpoints for CRUD operations on products.
  - [ ] Replace mock product data in `src/pages/POS.tsx` and `src/pages/Products.tsx` with API calls.
  - [ ] Implement real stock management that deducts stock on sales.
- [ ] **Transaction Backend Integration**
  - [ ] Create API endpoints for recording transactions.
  - [ ] Implement real transaction processing in `POSContext`.
  - [ ] Store and fetch transaction history for the `Transactions.tsx` page.
- [ ] **Customer Backend Integration**
  - [ ] Create API endpoints for customer CRUD operations.
  - [ ] Replace mock customer data with a real customer database.

## High Priority Features

- [ ] **Cash Register & Payment**
  - [ ] **Cash register open/close tracking** - Implement logic to track till opens, closes, and float management.
  - [ ] **Card payment machine integration** - Plan and develop integration with a payment terminal API.
- [ ] **Invoicing & Documentation**
  - [ ] **Credit note creation**
  - [ ] **Invoice generation with tax ID**
  - [ ] **Receipt numbering system**
  - [ ] **Receipt Data Integration** – see `RECEIPT_INTEGRATION_PLAN.md`

### Database Architecture
- [ ] Multi-tenant migration (Supabase single project)
  - [ ] Review `MULTI_TENANT_MIGRATION_PLAN.md`
  - [ ] Implement tenancy bootstrap (app schema, organizations, memberships)
  - [ ] Add and backfill `organization_id` across domain tables
  - [ ] Create tenant-scoped uniques and indexes
  - [ ] Replace policies with tenant+role RLS
  - [ ] Update RPCs/views and flip NOT NULL
  - [ ] Storage policies per organization

## Medium Priority Features

- [ ] **Printing & Hardware**
  - [ ] **Bluetooth/WiFi printer integration** for receipts.
- [ ] **Advanced Features**
  - [ ] **SAFT compliance** for tax reporting.
  - [ ] **Multi-language support** - Add translations for all remaining UI elements.

## Low Priority / Future Ideas

- [ ] **Mobile app version**
- [ ] **Self-service kiosk mode**
- [ ] **AI-driven features** (camera monitoring, etc.)
- [ ] **User manual and training documentation**

## 📚 Reference Files Created Today

- `SUPABASE_AUTH_INTEGRATION_PLAN.md` - Detailed authentication integration roadmap
- `secure_rls_policies.sql` - Secure row-level security policies for production use
- `SupabaseAuthContext.tsx` - New authentication context with Supabase Auth integration
- Updated authentication throughout app while maintaining backward compatibility

## Reliability and Performance

- [ ] Replace remaining table-based connectivity probes with centralized heartbeat (`supabase.rpc('ping')`)
- [ ] Ensure all services use `connectionStatus` for online/offline detection
- [ ] Add regression test to assert no repeated GETs to `/employees?select=id&limit=1` during navigation to receipt
