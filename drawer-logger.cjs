#!/usr/bin/env node

/**
 * Practical Cash Drawer Logging System
 * For 6-wire Sitten drawer with click sensor
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class DrawerLogger {
  constructor() {
    this.logFile = path.join(__dirname, 'drawer_activity.log');
    this.stateFile = path.join(__dirname, 'drawer_state.json');
    this.loadState();
  }

  loadState() {
    if (fs.existsSync(this.stateFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        this.drawerState = state.drawerState || 'unknown';
        this.lastOpenTime = state.lastOpenTime || null;
      } catch (error) {
        console.log('⚠️  Could not load state, starting fresh');
        this.drawerState = 'unknown';
        this.lastOpenTime = null;
      }
    } else {
      this.drawerState = 'unknown';
      this.lastOpenTime = null;
    }
  }

  saveState() {
    const state = {
      drawerState: this.drawerState,
      lastOpenTime: this.lastOpenTime,
      lastUpdate: Date.now()
    };
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  log(event, details = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event,
      state: this.drawerState,
      ...details
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(this.logFile, logLine);
    
    // Save state after every log entry
    this.saveState();
    
    console.log(`📝 ${timestamp}: ${event} (${this.drawerState})`);
    return logEntry;
  }

  async openDrawer(reason = 'manual_test') {
    console.log('🏦 Opening cash drawer...');
    
    // Send the working open command
    const openCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
    const tempFile = `/tmp/drawer_open_${Date.now()}.bin`;
    
    fs.writeFileSync(tempFile, openCommand);
    
    try {
      await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
      
      this.drawerState = 'open';
      this.lastOpenTime = Date.now();
      
      this.log('DRAWER_OPENED', {
        reason,
        command: '0x1B 0x70 0x00 0x19 0xFA',
        openTime: this.lastOpenTime
      });
      
      console.log('✅ Drawer opened successfully');
      console.log('💡 Please call logClose() when you manually close the drawer');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to open drawer:', error.message);
      return false;
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  async logCloseInteractive(method = 'manual') {
    if (this.drawerState !== 'open') {
      console.log('❌ ERROR: Cannot log close - drawer is not recorded as open!');
      console.log('💡 Current state:', this.drawerState);
      return false;
    }

    console.log('� DRAWER CLOSE CONFIRMATION');
    console.log('============================');
    console.log('Before logging the drawer as closed, please confirm:');
    console.log('');
    console.log('1. 🚪 Have you physically pushed the drawer closed?');
    console.log('2. � Did you hear the "click" sound?');
    console.log('3. 🔒 Is the drawer now flush with the printer?');
    console.log('');
    
    // In a real implementation, you'd use readline for user input
    // For now, we'll require explicit confirmation via command parameter
    console.log('💡 To confirm: node drawer-logger.cjs close-confirmed [method]');
    console.log('⚠️  Only use close-confirmed if drawer is actually closed!');
    
    return false;
  }

  logCloseConfirmed(method = 'manual') {
    if (this.drawerState !== 'open') {
      console.log('❌ ERROR: Cannot log close - drawer is not recorded as open!');
      console.log('💡 Current state:', this.drawerState);
      return false;
    }

    const closeTime = Date.now();
    const openDuration = this.lastOpenTime ? closeTime - this.lastOpenTime : null;

    this.drawerState = 'closed';
    
    this.log('DRAWER_CLOSED', {
      method,
      closeTime,
      openDurationMs: openDuration,
      openDurationMin: openDuration ? Math.round(openDuration / 60000 * 100) / 100 : null,
      confirmed: true
    });

    console.log('✅ Drawer confirmed and logged as closed');
    if (openDuration) {
      console.log(`⏱️  Open duration: ${Math.round(openDuration / 1000)} seconds`);
    }
    
    return true;
  }

  getActivity(hours = 24) {
    if (!fs.existsSync(this.logFile)) {
      return [];
    }

    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    const lines = fs.readFileSync(this.logFile, 'utf8').split('\n').filter(line => line.trim());
    
    return lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(entry => entry && new Date(entry.timestamp).getTime() > cutoffTime);
  }

  showActivity(hours = 24) {
    const activity = this.getActivity(hours);
    
    console.log(`\n📊 Drawer Activity (Last ${hours} hours)`);
    console.log('==========================================');
    
    if (activity.length === 0) {
      console.log('No activity recorded');
      return;
    }

    activity.forEach(entry => {
      const time = new Date(entry.timestamp).toLocaleString();
      const duration = entry.openDurationMin ? ` (${entry.openDurationMin}min)` : '';
      console.log(`${time}: ${entry.event}${duration}`);
    });

    // Summary
    const opens = activity.filter(e => e.event === 'DRAWER_OPENED').length;
    const closes = activity.filter(e => e.event === 'DRAWER_CLOSED').length;
    console.log(`\n📈 Summary: ${opens} opens, ${closes} closes`);
  }
}

// CLI Interface
async function main() {
  const logger = new DrawerLogger();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node drawer-logger.cjs open [reason]          - Open drawer and log');
    console.log('  node drawer-logger.cjs close [method]         - Check if ready to close (safe)');
    console.log('  node drawer-logger.cjs close-confirmed [method] - Log drawer close (confirmed)');
    console.log('  node drawer-logger.cjs activity [hours]       - Show activity log');
    console.log('  node drawer-logger.cjs status                 - Show current status');
    console.log('');
    console.log('Safe workflow:');
    console.log('  1. node drawer-logger.cjs open "reason"');
    console.log('  2. Manually close the drawer (hear the click)');
    console.log('  3. node drawer-logger.cjs close-confirmed "manual"');
    return;
  }

  switch (args[0]) {
    case 'open':
      const reason = args[1] || 'manual_command';
      await logger.openDrawer(reason);
      break;

    case 'close':
      const method = args[1] || 'manual';
      await logger.logCloseInteractive(method);
      break;

    case 'close-confirmed':
      const confirmedMethod = args[1] || 'manual';
      logger.logCloseConfirmed(confirmedMethod);
      break;

    case 'activity':
      const hours = parseInt(args[1]) || 24;
      logger.showActivity(hours);
      break;

    case 'status':
      console.log(`Current drawer state: ${logger.drawerState}`);
      if (logger.lastOpenTime) {
        const duration = Date.now() - logger.lastOpenTime;
        console.log(`Last opened: ${Math.round(duration / 1000)} seconds ago`);
      }
      break;

    default:
      console.log('Unknown command:', args[0]);
  }
}

main();
