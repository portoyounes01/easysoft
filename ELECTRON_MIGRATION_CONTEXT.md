# Electron Migration Context

## Project Overview

- **Type**: Offline-first POS (Point of Sale) system
- **Frontend**: React 18.3.1 + TypeScript + Vite 5.4.19
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Database**: IndexedDB (Dexie) for offline storage + Supabase sync
- **Styling**: Tailwind CSS
- **Hardware**: Thermal printer (HPRT TP80K) + Cash drawer (Sitten 6-wire)

## Current Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Web    │────│  Supabase Edge   │────│   Hardware      │
│   Frontend     │    │   Functions      │    │   (via CUPS)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
│
├── IndexedDB (offline data)
└── Local Node.js scripts (send-to-printer.cjs)
```

## Hardware Setup (Working)

- **Printer**: HPRT TP80K thermal printer
  - USB VID: 0x2aaf, PID: 0x6004
  - System printer name: "HPRT_TP80K"
  - Connected via USB, working with macOS CUPS
- **Cash Drawer**: Sitten 6-wire model
  - Connected to printer's RJ11 port
  - Opens with ESC/POS command: `0x1B 0x70 0x00 0x19 0xFA`
  - Has mechanical sensor for status detection

## Working Hardware Control Scripts

1. **send-to-printer.cjs** - Core ESC/POS command sender

   - Uses macOS CUPS system (`lp` command)
   - Functions: `sendCommandsToSystemPrinter()`, `testCashDrawer()`
   - Status: ✅ Fully functional

2. **drawer-logger.cjs** - Drawer event logging

   - State persistence with JSON files
   - Safety validation to prevent false logging
   - Status: ✅ Complete with validation

3. **drawer-status.cjs** - Visual status checker

   - Console-based drawer status display
   - Status: ✅ Working for manual checking

4. **direct-usb-status.cjs** - Direct USB hardware communication
   - **🎯 ONLY SCRIPT that can automatically detect drawer open/closed status**
   - Direct USB device communication for real-time status detection
   - Uses USB library for hardware communication with Sitten drawer sensors
   - Status: ✅ Working (detects when printer not connected)
   - **CRITICAL for Electron**: This enables automatic drawer status monitoring
   - Uses USB library for hardware communication
   - Status: ✅ Working (detects when printer not connected)

## Supabase Edge Functions (Deployed)

1. **cash-drawer** (ID: 30499b69-5626-4319-9c65-55bfb71670f6)

   - Controls cash drawer opening
   - Logs to `cash_drawer_logs` table
   - Status: ✅ Deployed and functional

2. **print-receipt** - Receipt printing control

   - Handles thermal receipt generation
   - Logs to `print_logs` table
   - Status: ✅ Deployed

3. **test-cashier** - Hardware testing suite
   - Comprehensive cashier hardware tests
   - Logs to `cashier_tests` table
   - Status: ✅ Deployed

## Database Schema

```sql
-- Cash drawer activity logging
CREATE TABLE cash_drawer_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id),
  action TEXT NOT NULL, -- 'open', 'close'
  command TEXT, -- 'standard', 'alternative', 'test'
  reason TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Print job logging
CREATE TABLE print_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id),
  content_type TEXT NOT NULL, -- 'receipt', 'report', 'test'
  content_data JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Cashier testing results
CREATE TABLE cashier_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id),
  test_suite TEXT NOT NULL,
  test_results JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  success BOOLEAN DEFAULT true
);
```

## Key Files for Electron Migration

### Hardware Control

- `send-to-printer.cjs` - Main hardware controller (Node.js)
- `drawer-logger.cjs` - Event logging system
- `src/utils/webSerialPrinter.ts` - Web Serial API (to be replaced)

### Frontend Components

- `src/pages/CashierTesting.tsx` - Hardware testing interface
- `src/contexts/POSContext.tsx` - POS state management
- `src/lib/localDatabase.ts` - IndexedDB/Dexie local storage

### Core Services

- `src/services/employeeService.ts` - Employee management
- `src/services/productService.ts` - Product management
- `src/services/transactionService.ts` - Transaction processing

## Current Limitations (Why Electron is Needed)

1. **Offline Hardware Control**: Supabase Edge Functions require internet
2. **Web Serial API**: Doesn't work with HPRT printer (uses USB HID, not serial)
3. **System Access**: Browser can't directly access CUPS/system printers
4. **File System**: Limited file system access for logging/configuration

## Migration Goals

1. **Maintain offline-first architecture** - IndexedDB + sync when online
2. **Direct hardware control** - Use node-escpos library directly
3. **System integration** - Full file system and printer access
4. **Keep existing UI** - React frontend should work unchanged
5. **Preserve data sync** - Supabase integration for multi-device sync

## Dependencies to Install for Electron

```json
{
  "devDependencies": {
    "electron": "^latest",
    "electron-builder": "^latest"
  },
  "dependencies": {
    "escpos": "^3.0.0-alpha.6",
    "escpos-usb": "^3.0.0-alpha.4",
    "serialport": "^12.0.0"
  }
}
```

## Hardware Control Requirements for Electron

1. **Cash Drawer Control**

   - ESC/POS commands: `0x1B 0x70 0x00 0x19 0xFA` (working timing)
   - Status detection via USB communication
   - Event logging with timestamps

2. **Thermal Printing**

   - Receipt generation with ESC/POS formatting
   - Logo/image printing capability
   - Text formatting (bold, underline, sizes)

3. **Hardware Detection**
   - Auto-detect HPRT TP80K printer (VID: 0x2aaf, PID: 0x6004)
   - Fallback to system printers if direct USB fails
   - Connection status monitoring

## Current Working ESC/POS Commands

```javascript
// Tested and working commands from send-to-printer.cjs
const CASH_DRAWER_COMMANDS = {
  standard: [0x1b, 0x70, 0x00, 0x19, 0xfa], // ✅ Working
  alternative: [0x1b, 0x70, 0x01, 0x19, 0xfa], // ✅ Working
  test: [0x1b, 0x70, 0x00, 0x0a, 0x0a], // ✅ Working
};

// Receipt formatting commands
const RECEIPT_COMMANDS = {
  initialize: [0x1b, 0x40], // Initialize printer
  cut: [0x1d, 0x56, 0x42, 0x00], // Partial cut
  bold_on: [0x1b, 0x45, 0x01], // Bold text
  bold_off: [0x1b, 0x45, 0x00], // Normal text
  center: [0x1b, 0x61, 0x01], // Center align
  left: [0x1b, 0x61, 0x00], // Left align
};
```

## Next Steps for New Chat

1. Create new branch: `git checkout -b electron-migration`
2. Install Electron dependencies
3. Set up main/renderer process architecture
4. Migrate hardware control from Edge Functions to native Node.js
5. Replace Web Serial API with direct USB/serial communication
6. Test hardware integration with existing ESC/POS commands
7. Preserve offline-first data architecture

## Testing Hardware (Available)

- HPRT TP80K thermal printer (USB connected, driver installed)
- Sitten 6-wire cash drawer (connected to printer)
- macOS system with CUPS integration
- All ESC/POS commands tested and working

## Important Notes

- Keep existing React frontend unchanged
- Preserve IndexedDB offline storage
- Maintain Supabase sync capabilities
- Hardware commands are proven to work - just need direct access
- Focus on main/renderer process IPC for hardware control
