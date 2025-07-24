# TODO - Future Development Tasks

> 📋 **IMPORTANT**: For security issues and vulnerabilities, see **`SECURITY_ISSUES.md`** - contains a comprehensive security audit with 12 categorized issues requiring attention.

## ⚡️ Urgent: Security Vulnerabilities

- [ ] **🚨 CRITICAL: Fix RLS Security Breach** - **IMMEDIATE ACTION REQUIRED**
  - [ ] Database has NO security - all RLS policies set to `USING (true)` allowing unrestricted access
  - [ ] Anyone can read/write/delete ALL data (employees, transactions, customers, products)
  - [ ] Must implement proper Supabase Auth integration
  - [ ] Must replace permissive RLS policies with role-based access control
  - [ ] Current state is **COMPLETELY INSECURE** for any production use
- [ ] **Address All Security Issues** - Remediate all "CRITICAL" and "HIGH" priority issues outlined in `SECURITY_ISSUES.md`. This includes:
  - [ ] Implement proper password hashing (bcrypt).
  - [ ] Secure session management (e.g., JWTs) and remove sensitive data from `localStorage`.
  - [ ] Implement session timeout.
  - [ ] Move authentication logic to a backend API.

## Critical: Backend Implementation

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
