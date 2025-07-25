/**
 * Database Fix Script
 * Run this script to diagnose and fix database issues
 */

// Simple script to fix database issues
const fixDatabase = async () => {
    console.log('🔍 Diagnosing database issues...');
    
    try {
        // Check if IndexedDB is available
        if (!window.indexedDB) {
            console.error('❌ IndexedDB not supported in this browser');
            return;
        }

        // Delete the corrupted database
        console.log('🗑️ Deleting corrupted database...');
        const deleteRequest = indexedDB.deleteDatabase('POSDatabase');
        
        deleteRequest.onsuccess = () => {
            console.log('✅ Database deleted successfully');
            console.log('🔄 Reloading page to reinitialize database...');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        };
        
        deleteRequest.onerror = (event) => {
            console.error('❌ Failed to delete database:', event);
            console.log('💡 Try manually clearing browser data or using incognito mode');
        };
        
        deleteRequest.onblocked = () => {
            console.warn('⚠️ Database deletion blocked. Close all tabs and try again.');
        };
        
    } catch (error) {
        console.error('❌ Error during database fix:', error);
        console.log('💡 Manual fix: Open DevTools > Application > IndexedDB > Delete POSDatabase');
    }
};

// Auto-run the fix
fixDatabase();

// Also expose it globally for manual execution
window.fixDatabase = fixDatabase;

console.log('🚀 Database fix script loaded. Run fixDatabase() to manually trigger.');