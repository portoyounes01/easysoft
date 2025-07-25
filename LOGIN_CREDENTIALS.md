# Test Credentials for POS System

After running the data population script, you can use these credentials to log in:

## Admin User

- **Employee Number**: EMP001
- **Name**: Carlos Ferreira
- **Password**: admin123
- **Role**: Admin (full access)

## Manager User

- **Employee Number**: EMP002
- **Name**: João Santos
- **Password**: manager123 (or PIN: 1234)
- **Role**: Manager (access to reports, inventory, etc.)

## Cashier User

- **Employee Number**: EMP003
- **Name**: Maria Oliveira
- **PIN**: 1234
- **Role**: Cashier (POS access only)

## How to Use

1. Go to http://localhost:5173
2. Click on "Admin Mode" toggle if you want to login as Admin/Manager
3. Select the employee from the list
4. Enter the password or PIN
5. Click "Login"

## After Login

- **Admin users** can access the Data Setup page at `/setup` to populate mock data
- The **Reports section** will show comprehensive data including:
  - Stock information (inventory report)
  - Sales analytics (employee performance, product analysis)
  - Transaction history
  - Overview metrics

## Notes

- Passwords are hashed using SHA-256
- The inventory report shows current stock levels for all products
- Transaction data spans the last 30 days with realistic sales patterns
- All data is stored in Supabase with proper foreign key relationships
