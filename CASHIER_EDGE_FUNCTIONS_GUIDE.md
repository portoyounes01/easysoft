# Cashier Hardware Testing - Edge Functions Setup

This document describes the Supabase Edge Functions implementation for testing cashier hardware (cash drawer and thermal printer) using ESC/POS commands.

## Overview

The system provides three main edge functions:

1. **`cash-drawer`** - Controls cash drawer operations
2. **`print-receipt`** - Generates thermal receipt printing commands
3. **`test-cashier`** - Comprehensive testing suite for all hardware

## Edge Functions

### 1. Cash Drawer Function (`/functions/cash-drawer/`)

**Endpoint:** `https://your-project.supabase.co/functions/v1/cash-drawer`

**Purpose:** Control cash drawer opening/closing and status tracking

**Request Body:**

```json
{
  "action": "open|close|status|test",
  "employeeId": "uuid",
  "transactionId": "uuid (optional)",
  "reason": "string (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Cash drawer open command generated",
  "command": [27, 112, 0, 25, 250],
  "timestamp": "2025-08-03T19:30:00.000Z",
  "logId": "uuid"
}
```

**ESC/POS Commands Generated:**

- Standard drawer open: `[0x1B, 0x70, 0x00, 0x19, 0xFA]`
- Alternative drawer: `[0x1B, 0x70, 0x01, 0x19, 0xFA]`
- Test pulse: `[0x1B, 0x70, 0x00, 0x0A, 0x7D]`

### 2. Print Receipt Function (`/functions/print-receipt/`)

**Endpoint:** `https://your-project.supabase.co/functions/v1/print-receipt`

**Purpose:** Generate ESC/POS commands for thermal receipt printing

**Request Body:**

```json
{
  "transactionId": "uuid",
  "receiptType": "customer|merchant|test",
  "printerSettings": {
    "width": 48,
    "fontSize": "normal",
    "copies": 1
  },
  "employeeId": "uuid"
}
```

**Response:**

```json
{
  "success": true,
  "receiptType": "customer",
  "transactionId": "uuid",
  "commands": [27, 64, 27, 97, 1, ...],
  "message": "customer receipt generated successfully"
}
```

**Features:**

- Full receipt formatting with store header
- Multiple font sizes and formatting options
- Support for Portuguese characters (ç, ñ, á, etc.)
- Automatic paper cutting
- Test receipt generation

### 3. Test Cashier Function (`/functions/test-cashier/`)

**Endpoint:** `https://your-project.supabase.co/functions/v1/test-cashier`

**Purpose:** Comprehensive testing suite for all cashier hardware

**Request Body:**

```json
{
  "testType": "cash-drawer|printer-test|full-sequence|hardware-check|all-tests",
  "employeeId": "uuid",
  "settings": {
    "printerWidth": 48,
    "drawerType": "standard",
    "includeSound": true
  }
}
```

**Test Types:**

1. **cash-drawer** - Test drawer opening mechanism
2. **printer-test** - Print comprehensive test page
3. **full-sequence** - Complete transaction: print receipt + open drawer
4. **hardware-check** - Physical inspection checklist
5. **all-tests** - Run complete test suite

## Database Tables

The functions use these logging tables:

### `cash_drawer_logs`

```sql
CREATE TABLE cash_drawer_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    transaction_id UUID REFERENCES transactions(id),
    action TEXT CHECK (action IN ('open', 'close', 'test', 'status')),
    reason TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);
```

### `print_logs`

```sql
CREATE TABLE print_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    transaction_id UUID REFERENCES transactions(id),
    receipt_type TEXT CHECK (receipt_type IN ('customer', 'merchant', 'test')),
    printer_settings JSONB,
    timestamp TIMESTAMPTZ NOT NULL,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);
```

### `cashier_tests`

```sql
CREATE TABLE cashier_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    test_type TEXT CHECK (test_type IN ('cash-drawer', 'printer-test', 'full-sequence', 'hardware-check', 'all-tests')),
    test_details JSONB,
    timestamp TIMESTAMPTZ NOT NULL,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    notes TEXT
);
```

## Frontend Integration

### React Component

The `CashierTesting` component (`/src/pages/CashierTesting.tsx`) provides:

- **Test Controls** - Buttons to run different hardware tests
- **Settings Panel** - Configure printer width, drawer type, audio feedback
- **Results Display** - Show test results with commands and instructions
- **Test History** - View previous test executions
- **Command Download** - Export ESC/POS commands as binary files

### Usage Example

```typescript
// Run cash drawer test
const { data, error } = await supabase.functions.invoke("test-cashier", {
  body: {
    testType: "cash-drawer",
    employeeId: employee.id,
    settings: {
      printerWidth: 48,
      drawerType: "standard",
    },
  },
});

if (data.success) {
  // Send commands to hardware
  sendToHardware(data.tests[0].commands);
}
```

## Hardware Integration

### ESC/POS Command Reference

**Printer Initialization:**

- `ESC @` (0x1B 0x40) - Initialize printer

**Text Formatting:**

- `ESC E` (0x1B 0x45) - Bold on/off
- `ESC -` (0x1B 0x2D) - Underline on/off
- `ESC !` (0x1B 0x21) - Font size

**Alignment:**

- `ESC a` (0x1B 0x61) - Text alignment (0=left, 1=center, 2=right)

**Paper Control:**

- `GS V B` (0x1D 0x56 0x42 0x00) - Cut paper

**Cash Drawer:**

- `ESC p` (0x1B 0x70 0x00 0x19 0xFA) - Open drawer

### Hardware Connection

The commands generated by the edge functions need to be sent to the hardware via:

1. **USB Connection** - Direct USB to thermal printer
2. **Serial Connection** - RS-232 or USB-to-Serial adapter
3. **Ethernet** - Network thermal printers
4. **Bluetooth** - Mobile thermal printers

## Deployment

### Deploy Functions

```bash
# Deploy all functions
supabase functions deploy cash-drawer
supabase functions deploy print-receipt
supabase functions deploy test-cashier

# Or deploy all at once
supabase functions deploy
```

### Environment Variables

Set these in your Supabase project:

```bash
# In Supabase Dashboard > Settings > Edge Functions
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Database Migration

Run the migration to create the necessary tables:

```bash
# Apply the migration
supabase db push

# Or run the SQL file directly in Supabase SQL Editor
```

## Testing

### Manual Testing

1. Navigate to `/cashier-testing` in your React app
2. Configure test settings (printer width, drawer type)
3. Run individual tests or complete suite
4. Download generated commands for hardware testing

### Hardware Testing

1. Connect thermal printer and cash drawer
2. Send downloaded command files to hardware
3. Verify expected behavior:
   - Cash drawer opens with audible click
   - Printer produces clear, formatted output
   - Paper cuts cleanly

## Troubleshooting

### Common Issues

1. **Commands not working**

   - Check ESC/POS compatibility
   - Verify baud rate (usually 9600 or 38400)
   - Try alternative drawer commands

2. **Character encoding issues**

   - Ensure printer supports CP437 or CP850 codepage
   - Test with basic ASCII first

3. **Paper cutting problems**
   - Check paper type (thermal paper required)
   - Verify cutter blade condition

### Debug Mode

Enable debug logging in edge functions:

```typescript
console.log("ESC/POS commands:", commands);
console.log("Hardware response:", response);
```

## Security

- All functions require authentication
- RLS policies restrict access to employee's own logs
- Admin users can view all test logs
- Commands are logged for audit purposes

## Future Enhancements

1. **Real-time hardware status** - Monitor printer paper, drawer state
2. **Command templates** - Predefined command sequences
3. **Multi-printer support** - Handle multiple printers per terminal
4. **Error recovery** - Automatic retry logic for failed commands
5. **Performance metrics** - Hardware response time tracking

## Support

For hardware-specific issues:

- Check printer manual for ESC/POS command reference
- Test with manufacturer's utilities first
- Verify cable connections and drivers

For software issues:

- Check Supabase function logs
- Verify database permissions
- Test with curl/Postman first
