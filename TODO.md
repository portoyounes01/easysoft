# TODO - Future Development Tasks

> 📋 **IMPORTANT**: For security issues and vulnerabilities, see **`SECURITY_ISSUES.md`** - contains comprehensive security audit with 12 categorized issues requiring attention.

## Critical Backend Implementation Needed

### Database & Data Persistence
- [ ] **Database setup and integration**
  - Real product storage and management
  - Transaction history storage
  - Employee data management
  - Customer database implementation

### Core POS Functionality
- [ ] **Real transaction processing** 
  - Actual payment processing logic
  - Transaction recording and storage
  - Receipt generation and printing

### Cash Register & Payment
- [ ] **Cash register open tracking** (Task #2)
  - Count and timestamp each drawer opening
  - Track reasons for non-sale openings
- [ ] **Card payment machine integration** (Task #5)
- [ ] **Cash denomination tracking** (Task #30, #31)
  - Input interface for bills and coins
  - Visual bill/coin selection
  - Automatic total calculation
- [ ] **Initial cash float tracking** (Task #32)
- [ ] **Drawer security controls** (Task #33)

### Inventory Management (Backend)
- [ ] **Real stock management**
  - Stock deduction on sales
  - Stock level tracking
  - Automated reorder points
- [ ] **Stock scanning system** (Task #12)
- [ ] **Automated stock alerts** (Task #36)

### Employee Management (Backend)
- [ ] **Employee performance tracking** (Task #4, #22)
  - Real sales tracking per employee
  - Time tracking at register
  - Performance analytics
- [ ] **Granular permission system** (Task #3)
  - Admin interface for permission management
  - Role-based feature access

## High Priority Features

### Invoicing & Documentation
- [ ] **Credit note creation** (Task #6)
- [ ] **Invoice generation with tax ID** (Task #18)
- [ ] **Wholesale invoicing system** (Task #17)
- [ ] **Receipt numbering system** (Task #25)
- [ ] **Duplicate receipt printing** (Task #23)
- [ ] **Numbered ticket system** (Task #24)

### Reporting & Analytics (Backend)
- [ ] **Date range sales reports** (Task #10, #11, #13)
- [ ] **Monthly Excel export** (Task #28)
- [ ] **Real-time sales consultation** (Task #9)

### Discount & Voucher System
- [ ] **Mobile voucher system** (Task #7)
- [ ] **Percentage discount implementation** (Task #8)
- [ ] **Voucher printing capability**

## Medium Priority Features

### Multi-Platform Support
- [ ] **Mobile app version** (Task #16)
- [ ] **Windows keyboard support** (Task #34)
- [ ] **Multi-language support** (Task #39)

### Printing & Hardware
- [ ] **Bluetooth/WiFi printer integration** (Task #15)
- [ ] **Kitchen display system**

### Advanced Features
- [ ] **SAFT compliance** (Task #35)
- [ ] **Self-service kiosk mode** (Task #38)
- [ ] **AI camera integration** (Task #26)
- [ ] **Real-time notifications** (Task #27)

## Documentation & Training
- [ ] **User manual creation** (Task #29)

## Notes
- Mostly frontend interfaces with mock data
- Priority on backend functionality
- Database integration is critical for moving from prototype to production
- Most "completed" features need backend implementation to be truly functional