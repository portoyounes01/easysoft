# 🏪 Cashier Testing Interface - User Guide

## 📍 **Getting Started**

### Step 1: Access the Interface

1. **Navigate** to `http://localhost:5173/` in your browser
2. **Login** with your employee credentials (admin/manager role required)
3. **Click** on "Cashier Testing" in the sidebar (⚡ icon)
4. **URL**: `http://localhost:5173/cashier-testing`

---

## 🎛️ **Interface Overview**

The Cashier Testing page is divided into **4 main sections**:

### 1. **📋 Header Section**

- **Title**: "Cashier Hardware Testing"
- **Description**: Overview of functionality
- **Refresh Button**: Updates test history
- **Current User**: Shows logged-in employee info

### 2. **⚙️ Settings Panel**

Configure your hardware before testing:

| Setting           | Options                               | Description                                |
| ----------------- | ------------------------------------- | ------------------------------------------ |
| **Printer Width** | 32, 42, 48 characters                 | Characters per line for receipt formatting |
| **Drawer Type**   | Standard (Pin 0), Alternative (Pin 1) | Cash drawer connection type                |
| **Include Sound** | Checkbox                              | Enable audio feedback (future feature)     |

**💡 Tip**: Most thermal printers use **48 characters**, most cash drawers use **Standard** type.

### 3. **🧪 Test Controls**

Five test buttons with different hardware functions:

#### 🟢 **Cash Drawer Test**

- **Purpose**: Test cash drawer opening mechanism
- **What it does**: Generates ESC/POS commands to open drawer
- **Expected result**: Drawer should open with audible "pop" sound

#### 🔵 **Printer Test**

- **Purpose**: Test thermal printer functionality
- **What it does**: Creates comprehensive test receipt
- **Expected result**: Prints test page with fonts, alignment, characters

#### 🟣 **Full Sequence**

- **Purpose**: Complete transaction simulation
- **What it does**: Print receipt → Open cash drawer
- **Expected result**: Receipt prints first, then drawer opens

#### 🟠 **Hardware Check**

- **Purpose**: Physical inspection checklist
- **What it does**: Provides step-by-step hardware inspection guide
- **Expected result**: Manual verification checklist

#### 🔴 **All Tests**

- **Purpose**: Run complete test suite
- **What it does**: Executes all tests above in sequence
- **Expected result**: Comprehensive testing results

### 4. **📊 Test Results & History**

- **Results Panel**: Shows detailed test outcomes
- **Test History**: Lists recent test executions
- **Command Download**: Export ESC/POS commands

---

## 🚀 **Step-by-Step Testing Process**

### **Phase 1: Initial Setup**

1. **Configure Settings**:

   ```
   Printer Width: 48 characters
   Drawer Type: Standard
   Include Sound: ✓ checked
   ```

2. **Verify Connection**:
   - Ensure thermal printer is connected via USB
   - Check cash drawer is connected to printer
   - Confirm paper is loaded in printer

### **Phase 2: Individual Tests**

#### **🟢 Test 1: Cash Drawer**

1. **Click** "Cash Drawer Test" button
2. **Wait** for function execution (loading spinner)
3. **Review Results**:

   - ✅ Success indicator
   - 📝 Instructions list
   - 🔢 ESC/POS commands generated
   - 📥 Download button for commands

4. **Expected Commands**:

   ```
   ESC/POS: 0x1B 0x70 0x00 0x19 0xFA
   Bytes: [27, 112, 0, 25, 250]
   ```

5. **Physical Test**:
   - Download the commands file
   - Send to hardware via your POS software
   - Drawer should open with "click" sound

#### **🔵 Test 2: Printer Test**

1. **Click** "Printer Test" button
2. **Review Generated Commands**:

   - Header formatting
   - Font size variations
   - Character encoding test
   - Alignment tests

3. **Expected Output**:

   ```
   PRINTER TEST
   Cash Register System
   ========================
   Font Test:
   Small font size
   Normal font size
   Large font size

   Formatting Test:
   Bold text
   Underlined text
       Centered text
            Right aligned

   Character set test:
   € $ £ ¥ © ® ™ ° ± × ÷
   Portuguese: ção ñ áéíóú
   ========================
   Test completed successfully!
   [Current Date/Time]
   ```

#### **🟣 Test 3: Full Sequence**

1. **Click** "Full Sequence" button
2. **Expected Behavior**:

   - Receipt prints with transaction details
   - Cash drawer opens after printing
   - Complete POS transaction simulation

3. **Sample Receipt**:

   ```
   TRANSACTION COMPLETE

   Receipt #: TEST-001
   Date: 03/08/2025
   Time: 20:50:15
   Cashier: Test User

   Test Item 1         €10.00
   Test Item 2         €15.50
   ────────────────────────────
   TOTAL:              €25.50
   Payment: Cash

   Thank you for your purchase!
   Please keep your receipt
   ```

### **Phase 3: Results Analysis**

#### **📊 Understanding Test Results**

Each test provides:

1. **Test Information**:

   - Test name and description
   - Expected result description
   - Success/failure indicator

2. **Instructions List**:

   - Step-by-step execution guide
   - What to look for during testing
   - Manual verification steps

3. **Command Details**:

   - Raw ESC/POS command bytes
   - Hexadecimal representation
   - Command count and sequence

4. **Download Options**:
   - Binary command file (.bin)
   - Ready for hardware transmission
   - Compatible with ESC/POS printers

#### **📥 Using Downloaded Commands**

1. **Download** the .bin file from test results
2. **Options for sending to hardware**:

   **Option A: Direct USB/Serial**:

   ```bash
   # Linux/Mac
   cat test-commands.bin > /dev/ttyUSB0

   # Windows (Command Prompt)
   copy test-commands.bin COM1:
   ```

   **Option B: Programming Integration**:

   ```javascript
   // Node.js example
   const fs = require("fs");
   const SerialPort = require("serialport");

   const commands = fs.readFileSync("test-commands.bin");
   const port = new SerialPort("/dev/ttyUSB0", { baudRate: 9600 });
   port.write(commands);
   ```

   **Option C: POS Software**:

   - Import commands into your POS software
   - Send via printer driver
   - Test through application interface

---

## 📈 **Test History & Monitoring**

### **Right Panel: Test History**

- **Recent Tests**: Last 10 test executions
- **Test Details**: Type, timestamp, success status
- **Filter Options**: By test type and date
- **Employee Tracking**: Shows who ran each test

### **Test Log Information**:

```
Cash Drawer Test               ✅
08/03/2025 20:45:33
drawerType: standard
printerWidth: 48

Printer Test                   ✅
08/03/2025 20:46:15
printerWidth: 48
includeSound: true
```

---

## 🔧 **Troubleshooting Guide**

### **❌ Common Issues**

#### **1. Function Call Fails**

- **Symptom**: Error message on test execution
- **Solution**: Check internet connection and Supabase project status
- **Debug**: Open browser console for detailed error

#### **2. Commands Don't Work on Hardware**

- **Symptom**: Downloaded commands don't affect hardware
- **Solutions**:
  - Verify ESC/POS compatibility
  - Check baud rate (try 9600, 19200, 38400)
  - Test with different drawer type setting
  - Ensure proper cable connections

#### **3. Characters Print Incorrectly**

- **Symptom**: Special characters (€, ç, ñ) appear as boxes/question marks
- **Solutions**:
  - Check printer codepage settings (CP437, CP850, CP1252)
  - Verify printer supports extended character sets
  - Test with basic ASCII first

#### **4. Paper Doesn't Cut**

- **Symptom**: Receipt prints but doesn't cut automatically
- **Solutions**:
  - Check cutter blade condition
  - Verify paper type (thermal paper required)
  - Some printers require manual cutting

#### **5. Authentication Errors**

- **Symptom**: "Access token not provided" or permission errors
- **Solutions**:
  - Ensure you're logged in with admin/manager role
  - Check Supabase connection in browser network tab
  - Verify environment variables in .env file

---

## 🎯 **Best Practices**

### **Before Testing**:

1. ✅ Verify hardware connections
2. ✅ Load thermal paper correctly
3. ✅ Check cash drawer is closed
4. ✅ Configure settings appropriately
5. ✅ Have backup power for equipment

### **During Testing**:

1. 📝 Run tests in sequence (drawer → printer → full)
2. 📋 Document any issues or unexpected behavior
3. 🔄 Test multiple times for consistency
4. 📊 Monitor test history for patterns

### **After Testing**:

1. 🗃️ Save successful command files for future use
2. 📝 Document working configurations
3. 🔧 Update settings based on test results
4. 📋 Create hardware maintenance schedule

---

## 🚀 **Advanced Usage**

### **Custom Command Testing**

1. Download successful test commands
2. Modify commands for specific needs
3. Test custom sequences
4. Document working modifications

### **Integration Planning**

1. Use test results to plan Electron integration
2. Document hardware requirements
3. Test command timing and sequences
4. Plan error handling strategies

### **Performance Monitoring**

1. Track test execution times
2. Monitor hardware response rates
3. Document reliability metrics
4. Plan maintenance schedules

---

## 📞 **Support & Resources**

### **Documentation**:

- `CASHIER_EDGE_FUNCTIONS_GUIDE.md` - Technical implementation
- Supabase Dashboard - Function logs and monitoring
- ESC/POS Command Reference - Hardware documentation

### **Debugging**:

- Browser Console - JavaScript errors and network requests
- Supabase Logs - Edge function execution details
- Test History - Pattern analysis and troubleshooting

### **Hardware Resources**:

- Printer Manual - ESC/POS command reference
- Manufacturer Support - Hardware-specific guidance
- POS Communities - User experiences and solutions

---

## 🎉 **Success Indicators**

You'll know everything is working when:

✅ **Cash Drawer**: Opens with audible click/pop sound  
✅ **Printer**: Produces clear, formatted test receipt  
✅ **Full Sequence**: Receipt prints followed by drawer opening  
✅ **Commands**: Download and hardware execution successful  
✅ **History**: All tests logged and trackable

**🏆 Congratulations!** Your cashier hardware testing system is fully operational!
