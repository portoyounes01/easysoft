import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translation resources
const resources = {
    en: {
        translation: {
            common: {
                logout: 'Logout',
                cancel: 'Cancel',
                confirm: 'Confirm',
                tillOpen: 'Till Open',
                profile: 'Profile',
                searchPlaceholder: 'Search products, customers...',
                select: 'Select',
            },
            pos: {
                backToCategories: 'Back to Categories',
                processPayment: 'Process Payment',
                customer: 'Customer',
                outOfStock: 'OUT OF STOCK',
                noProductsFoundTitle: 'No products found',
                noProductsFoundMessage: 'No products match in this category',
                noCartItemsTitle: 'No items in cart',
                noCartItemsMessage: 'Start adding products to begin',
                clearCart: 'Clear Cart',
                cash: 'Cash',
                card: 'Card',
                cashReceived: 'Cash Received:',
                changeDue: 'Change Due:',
                completeSale: 'Complete Sale',
                confirmLogoutTitle: 'Confirm Logout',
                confirmLogoutQuestion: 'Are you sure you want to logout?',
                unsavedWork: 'Any unsaved work will be lost.',
                sessionTimeoutWarning: 'Session Timeout Warning',
                autoLogoutMessage: 'You will be automatically logged out in:\n',
                securityNotice: 'This is for security purposes. Click "Stay Logged In" to continue your session.',
                logoutNow: 'Logout Now',
                stayLoggedIn: 'Stay Logged In',
                selectCustomerTitle: 'Select Customer',
                searchByNif: 'Search by NIF...',
                addNew: 'Add New',
                noCustomersFoundTitle: 'No customers found',
                noCustomersFoundMessage: 'Try adjusting your search or add a new customer',
                totalOrders: 'Total Orders',
                select: 'Select',
                discountLabel: 'Discount',
                customerDiscountLabel: 'Customer Discount',
                subtotalLabel: 'Subtotal',
                taxLabel: 'Tax',
                totalLabel: 'Total',
                saleInProgress: 'Sale in Progress',
                cartCustomerHeader: 'Customer',
                discountHeader: 'Discount',
                discountPercentage: 'Discount %',
                discountFixed: 'Discount €',
                search: 'Search',
            },
        },
    },
    pt: {
        translation: {
            common: {
                logout: 'Sair',
                cancel: 'Cancelar',
                confirm: 'Confirmar',
                tillOpen: 'Caixa Aberta',
                profile: 'Perfil',
                searchPlaceholder: 'Procurar produtos, clientes...',
                select: 'Selecionar',
            },
            pos: {
                backToCategories: 'Voltar às Categorias',
                processPayment: ' Pagamento',
                customer: 'Fatura com NIF',
                outOfStock: 'SEM STOCK',
                noProductsFoundTitle: 'Nenhum produto encontrado',
                noProductsFoundMessage: 'Nenhum produto corresponde nesta categoria',
                noCartItemsTitle: 'Sem itens no carrinho',
                noCartItemsMessage: 'Comece a adicionar produtos para iniciar',
                clearCart: 'Limpar Carrinho',
                cash: 'Dinheiro',
                card: 'Cartão',
                cashReceived: 'Dinheiro Recebido:',
                changeDue: 'Troco:',
                completeSale: 'Concluir Venda',
                confirmLogoutTitle: 'Confirmar Logout',
                confirmLogoutQuestion: 'Tem a certeza de que quer sair?',
                unsavedWork: 'Qualquer trabalho não guardado será perdido.',
                sessionTimeoutWarning: 'Aviso de Tempo de Sessão',
                autoLogoutMessage: 'Será automaticamente desconectado em:\n',
                securityNotice: 'Por motivos de segurança. Clique em "Manter Sessão" para continuar.',
                logoutNow: 'Sair Agora',
                stayLoggedIn: 'Manter Sessão',
                selectCustomerTitle: 'Selecionar Cliente',
                searchByNif: 'Pesquisar por NIF...',
                addNew: 'Adicionar Novo',
                noCustomersFoundTitle: 'Nenhum cliente encontrado',
                noCustomersFoundMessage: 'Tente ajustar a pesquisa ou adicione um novo cliente',
                totalOrders: 'Total de Pedidos',
                select: 'Selecionar',
                discountLabel: 'Desconto',
                customerDiscountLabel: 'Desconto de Cliente',
                subtotalLabel: 'Subtotal',
                taxLabel: 'IVA',
                totalLabel: 'Total',
                saleInProgress: 'Venda em Curso',
                cartCustomerHeader: 'Cliente',
                discountHeader: 'Desconto',
                discountPercentage: 'Desconto %',
                discountFixed: 'Desconto €',
                search: 'Pesquisar',
            },
        },
    },
} as const;

i18n
    .use(LanguageDetector) // Detect language from browser/localStorage
    .use(initReactI18next) // Pass i18n instance to react-i18next
    .init({
        resources,
        fallbackLng: 'en',
        debug: false,
        ns: ['translation'],
        defaultNS: 'translation',
        interpolation: {
            escapeValue: false, // React already does escaping
        },
        detection: {
            // Order and from where user language should be detected
            order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
            caches: ['localStorage'],
        },
    });

export default i18n; 