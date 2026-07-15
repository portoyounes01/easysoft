import React from 'react';
import { Package } from 'lucide-react';

// Card width as percentage of viewport width (height is calculated based on aspect ratio)
const CARD_WIDTH_VW = 12;
const INFO_HEIGHT_VW = CARD_WIDTH_VW * 0.4; // Info section is 40% of width

export interface ProductCardProps {
    name: string;
    price: number;
    stock: number;
    imageUrl?: string;
    cartQuantity?: number;
    remainingStock?: number;
    isOutOfStock?: boolean;
    canAdd?: boolean;
    onClick?: () => void;
    outOfStockLabel?: string;
    /** Sold by weight: price renders as €/kg. */
    soldByWeight?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
    name,
    price,
    stock,
    imageUrl,
    cartQuantity = 0,
    remainingStock,
    isOutOfStock = false,
    canAdd = true,
    soldByWeight = false,
    onClick,
    outOfStockLabel = 'Out of Stock'
}) => {
    const displayStock = remainingStock !== undefined ? remainingStock : stock;

    return (
        <div
            style={{
                width: `${CARD_WIDTH_VW}vw`,
                // height: `${CARD_WIDTH_VW}vw`
            }}
            className={`
                bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-200 cursor-pointer relative
                ${canAdd
                    ? 'hover:shadow-lg hover:scale-105'
                    : 'opacity-60 cursor-not-allowed'
                }
            `}
            onClick={canAdd ? onClick : undefined}
        >
            {/* Cart Quantity Badge */}
            {cartQuantity > 0 && (
                <div
                    className="absolute bg-gradient-primary text-neutral-50 rounded-full flex items-center justify-center font-bold z-10"
                    style={{
                        top: `${CARD_WIDTH_VW * 0.08}vw`,
                        right: `${CARD_WIDTH_VW * 0.08}vw`,
                        width: `${CARD_WIDTH_VW * 0.18}vw`,
                        height: `${CARD_WIDTH_VW * 0.18}vw`,
                        fontSize: `${CARD_WIDTH_VW * 0.1}vw`
                    }}
                >
                    {soldByWeight ? cartQuantity.toFixed(3) : cartQuantity}
                </div>
            )}

            {/* Bottom gradient indicator when item is in cart */}
            {cartQuantity > 0 && (
                <div
                    className="absolute bottom-0 left-0 right-0 bg-primary-600 rounded-b-xl z-10"
                    style={{ height: `${CARD_WIDTH_VW * 0.03}vw` }}
                />
            )}

            {/* Product Image - Square */}
            <div
                className="relative bg-gray-100 flex items-center justify-center"
                style={{ width: `${CARD_WIDTH_VW}vw`, height: `${CARD_WIDTH_VW}vw` }}
            >
                {/* Default icon (visible under image or when image hidden) */}
                <Package
                    className={`text-gray-400 ${isOutOfStock ? 'grayscale' : ''}`}
                    style={{ width: `${CARD_WIDTH_VW * 0.3}vw`, height: `${CARD_WIDTH_VW * 0.3}vw` }}
                />
                {/* Product image overlays the icon when available */}
                {imageUrl && (
                    <img
                        src={imageUrl}
                        alt={name}
                        className={`absolute inset-0 w-full h-full object-cover ${isOutOfStock ? 'grayscale' : ''}`}
                        onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.style.display = 'none';
                        }}
                    />
                )}

                {/* Out of Stock Overlay */}
                {isOutOfStock && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div
                            className="bg-red-500 text-neutral-50 rounded-lg font-bold"
                            style={{
                                padding: `${CARD_WIDTH_VW * 0.04}vw ${CARD_WIDTH_VW * 0.08}vw`,
                                fontSize: `${CARD_WIDTH_VW * 0.09}vw`
                            }}
                        >
                            {outOfStockLabel}
                        </div>
                    </div>
                )}
            </div>

            {/* Product Info */}
            <div
                className="flex flex-col"
                style={{
                    padding: `${CARD_WIDTH_VW * 0.06}vw`,
                    height: `${INFO_HEIGHT_VW}vw`
                }}
            >
                <h3
                    className="font-semibold text-gray-800 truncate flex-1"
                    title={name}
                    style={{ fontSize: `${CARD_WIDTH_VW * 0.09}vw` }}
                >
                    {name}
                </h3>

                {/* Price and Stock at bottom */}
                <div
                    className="flex items-center justify-between mt-auto"
                    style={{ paddingTop: `${CARD_WIDTH_VW * 0.04}vw` }}
                >
                    <span
                        className="font-bold text-gray-900"
                        style={{ fontSize: `${CARD_WIDTH_VW * 0.07}vw` }}
                    >
                        €{price.toFixed(2)}{soldByWeight ? '/kg' : ''}
                    </span>
                    <span
                        className="text-gray-500"
                        style={{ fontSize: `${CARD_WIDTH_VW * 0.07}vw` }}
                    >
                        Stock: {soldByWeight ? `${Number(displayStock.toFixed(3))} kg` : displayStock}
                    </span>
                </div>
            </div>
        </div>
    );
};
