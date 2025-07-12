import '@testing-library/jest-dom';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';          // <-- provides IndexedDB in Node
import { IDBKeyRange } from 'fake-indexeddb';

// Set up fake-indexeddb properly for Dexie
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

// Make sure global indexedDB is available
if (typeof global !== 'undefined') {
    global.indexedDB = indexedDB;
    global.IDBKeyRange = IDBKeyRange;
}

// Ensure a clean DB for each test run
if (typeof indexedDB !== 'undefined' && 'deleteDatabase' in indexedDB) {
    indexedDB.deleteDatabase('POSDatabase');
} 