import { useState } from 'react';
import { SortOption } from '../types';
import { Menu } from 'lucide-react';

interface SortDropdownProps {
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export function SortDropdown({ currentSort, onSortChange }: SortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'featured', label: 'FEATURED' },
    { value: 'alphabetically-a-z', label: 'ALPHABETICALLY, A-Z' },
    { value: 'alphabetically-z-a', label: 'ALPHABETICALLY, Z-A' },
    { value: 'discount-high-low', label: 'DISCOUNT, HIGH TO LOW' },
    { value: 'date-old-new', label: 'DATE, OLD TO NEW' },
    { value: 'date-new-old', label: 'DATE, NEW TO OLD' },
  ];

  const currentLabel = sortOptions.find(opt => opt.value === currentSort)?.label || 'SORT';

  const handleSelect = (value: SortOption) => {
    onSortChange(value);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 border border-border bg-background hover:bg-muted transition-colors whitespace-nowrap"
        style={{ fontFamily: 'DM Sans, sans-serif' }}
      >
        <Menu className="w-4 h-4" />
        <span className="text-xs tracking-widest uppercase font-normal">{currentLabel}</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="absolute right-0 top-full mt-1 w-72 bg-white border border-border shadow-lg z-50 py-4"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            {sortOptions.map((option, index) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left px-6 py-3 text-sm tracking-wide uppercase hover:bg-muted transition-colors whitespace-nowrap ${
                  currentSort === option.value ? 'font-medium underline underline-offset-4' : 'font-normal'
                } ${index === 0 ? 'border-b border-border pb-5 mb-2' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
