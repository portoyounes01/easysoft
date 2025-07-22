/**
 * Secure password hashing utility
 * Works in both secure (HTTPS) and non-secure (HTTP) contexts
 * Uses crypto.subtle when available, falls back to js-sha256
 */

import { sha256 } from 'js-sha256';

/**
 * Hash a password using SHA-256
 * Automatically chooses the best available method:
 * - crypto.subtle (browser native, secure contexts)
 * - js-sha256 (library fallback, any context)
 * 
 * Both methods produce identical SHA-256 hashes
 */
export const hashPassword = async (password: string): Promise<string> => {
    // Try crypto.subtle first (available in secure contexts like HTTPS)
    if (window.crypto && window.crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            console.warn('crypto.subtle failed, using js-sha256 fallback:', error);
            return sha256(password);
        }
    } else {
        // Use js-sha256 library for non-secure contexts (same algorithm, different implementation)
        console.warn('crypto.subtle not available (non-secure context), using js-sha256');
        return sha256(password);
    }
};

/**
 * Verify if two hashes match
 * Useful for password verification
 */
export const verifyPasswordHash = (password: string, expectedHash: string): Promise<boolean> => {
    return hashPassword(password).then(hash => hash === expectedHash);
};

/**
 * Check if crypto.subtle is available
 * Useful for debugging or feature detection
 */
export const isCryptoSubtleAvailable = (): boolean => {
    return !!(window.crypto && window.crypto.subtle);
};

/**
 * Get hash method being used
 * For debugging purposes
 */
export const getHashMethod = (): string => {
    return isCryptoSubtleAvailable() ? 'crypto.subtle' : 'js-sha256';
}; 