import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface CategoryFilterButtonProps {
    label: string;
    icon: LucideIcon;
    isSelected: boolean;
    onClick: () => void;
}

// Button size as percentage of viewport width (used for both width and height to keep it square)
const BUTTON_SIZE_VW = 7;

export const CategoryFilterButton: React.FC<CategoryFilterButtonProps> = ({
    label,
    icon: Icon,
    isSelected,
    onClick
}) => {
    // Split label into words and take max 2
    const words = label.split(' ');
    const displayWords = words.slice(0, 2);

    return (
        <button
            onClick={onClick}
            style={{
                width: `${BUTTON_SIZE_VW}vw`,
                height: `${BUTTON_SIZE_VW}vw`,
                minWidth: `${BUTTON_SIZE_VW}vw`,
                minHeight: `${BUTTON_SIZE_VW}vw`,
            }}
            className={`flex-shrink-0 flex flex-col items-center justify-center rounded transition-all duration-200 relative ${isSelected
                ? 'bg-white shadow-sm'
                : 'bg-gray-200 hover:bg-gray-50'
                }`}
        >
            {/* Left indicator for selected state */}
            {isSelected && (
                <div
                    className="absolute left-0 top-1/2 transform -translate-y-1/2 rounded-full bg-gradient-primary"
                    style={{ width: '0.5vw', height: '3vw' }}
                />
            )}

            <div
                className={`flex items-center justify-center ${isSelected ? 'text-primary-600' : 'text-neutral-500'}`}
                style={{ width: `${BUTTON_SIZE_VW * 0.4}vw`, height: `${BUTTON_SIZE_VW * 0.4}vw`, marginBottom: '0.3vw' }}
            >
                <Icon style={{ width: `${BUTTON_SIZE_VW * 0.3}vw`, height: `${BUTTON_SIZE_VW * 0.3}vw` }} />
            </div>
            <div
                className={`text-center leading-tight w-full ${isSelected ? 'font-semibold text-primary-900' : 'font-medium text-neutral-500'}`}
                style={{ fontSize: `${BUTTON_SIZE_VW * 0.14}vw`, padding: '0 0.2vw' }}
            >
                {displayWords.length > 1 ? (
                    // Two words: show one per line, each truncated if needed
                    <div className="flex flex-col items-center w-full overflow-hidden">
                        <span className="truncate w-full block">{displayWords[0]}</span>
                        <span className="truncate w-full block">
                            {displayWords[1]}{words.length > 2 ? '...' : ''}
                        </span>
                    </div>
                ) : (
                    // Single word: truncate with ellipsis
                    <div className="truncate w-full">{label}</div>
                )}
            </div>
        </button>
    );
};
