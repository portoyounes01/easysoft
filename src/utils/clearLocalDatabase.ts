import { localDb } from '../lib/localDatabase';

export const clearLocalDatabase = async () => {
    try {
        console.log('🗑️  Starting local database cleanup...');

        // Check current data before clearing
        const categoryCount = await localDb.categories.count();
        const productCount = await localDb.products.count();

        console.log('📊 Current database state:');
        console.log(`   Categories: ${categoryCount}`);
        console.log(`   Products: ${productCount}`);

        if (categoryCount === 0 && productCount === 0) {
            console.log('✅ Database is already empty - nothing to clear');
            return;
        }

        // Clear products first (due to foreign key relationship)
        console.log('🗂️  Clearing products...');
        await localDb.products.clear();
        console.log('   ✅ Products cleared');

        // Clear categories
        console.log('📂 Clearing categories...');
        await localDb.categories.clear();
        console.log('   ✅ Categories cleared');

        // Verify cleanup
        const finalCategoryCount = await localDb.categories.count();
        const finalProductCount = await localDb.products.count();

        console.log('🎉 Database cleanup completed successfully!');
        console.log('📊 Final database state:');
        console.log(`   Categories: ${finalCategoryCount}`);
        console.log(`   Products: ${finalProductCount}`);

        if (finalCategoryCount === 0 && finalProductCount === 0) {
            console.log('✅ All products and categories have been successfully removed');
        } else {
            console.warn('⚠️  Some data may still remain - please check manually');
        }

    } catch (error) {
        console.error('❌ Error clearing local database:', error);
        throw error;
    }
};

// Main execution block - runs when script is called directly
if (typeof window === 'undefined' && import.meta.url) {
    // This is a Node.js environment and we can check if this is the main module
    const currentFilePath = new URL(import.meta.url).pathname;
    const isMainModule = process.argv[1] && process.argv[1].endsWith(currentFilePath.split('/').pop() || '');

    if (isMainModule) {
        console.log('🚀 Running clear local database script...');
        clearLocalDatabase()
            .then(() => {
                console.log('✅ Script completed successfully');
                process.exit(0);
            })
            .catch((error) => {
                console.error('💥 Script failed:', error);
                process.exit(1);
            });
    }
} 