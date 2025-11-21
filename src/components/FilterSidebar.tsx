import { useState } from 'react';
import { FilterOptions } from '../types';
import { Checkbox } from './ui/checkbox';
import { ChevronDown, ChevronRight, Menu, X } from 'lucide-react';

interface FilterSidebarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
}

export function FilterSidebar({ filters, onFilterChange }: FilterSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    type: true,
    priceRange: true,
    discount: true,
    maxWomensSize: true,
    values: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleCheckboxChange = (
    filterKey: keyof FilterOptions,
    value: string,
    checked: boolean
  ) => {
    const currentValues = filters[filterKey];
    const newValues = checked
      ? [...currentValues, value]
      : currentValues.filter(v => v !== value);

    onFilterChange({
      ...filters,
      [filterKey]: newValues
    });
  };

  const FilterSection = ({
    title,
    filterKey,
    options
  }: {
    title: string;
    filterKey: keyof FilterOptions;
    options: string[];
  }) => {
    const isExpanded = expandedSections[filterKey];
    
    return (
      <div className="mb-6 last:mb-0">
        <button
          onClick={() => toggleSection(filterKey)}
          className="w-full flex items-center justify-between py-3 px-0 text-left hover:opacity-70 transition-opacity"
        >
          <span className="text-sm tracking-widest uppercase font-medium" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            {title}
          </span>
          {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
        </button>
        
        {isExpanded && (
          <div className="pt-3 space-y-3">
            {options.map((option) => (
              <div key={option} className="flex items-center justify-between gap-3">
                <label
                  htmlFor={`${filterKey}-${option}`}
                  className="text-sm cursor-pointer leading-none tracking-wide"
                  style={{ 
                    fontFamily: 'DM Sans, sans-serif',
                    textTransform: 'uppercase',
                    fontWeight: 300
                  }}
                >
                  {option}
                </label>
                <Checkbox
                  id={`${filterKey}-${option}`}
                  checked={filters[filterKey].includes(option)}
                  onCheckedChange={(checked: boolean) =>
                    handleCheckboxChange(filterKey, option, checked)
                  }
                  className="w-4 h-4 flex-shrink-0"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-6 py-3 border border-border bg-background hover:bg-muted transition-colors whitespace-nowrap"
        style={{ fontFamily: 'DM Sans, sans-serif' }}
      >
        <Menu className="w-4 h-4" />
        <span className="text-sm tracking-wider uppercase font-normal">{isOpen ? 'HIDE FILTERS' : 'FILTER'}</span>
      </button>

      {/* Sidebar with slide-in animation */}
      <div
        className="fixed right-0 top-0 w-80 h-full bg-white border-l border-border overflow-y-auto z-50 p-8 transition-transform duration-300 ease-in-out"
        style={{ 
          fontFamily: 'DM Sans, sans-serif',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          pointerEvents: isOpen ? 'auto' : 'none'
        }}
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-sm tracking-widest uppercase font-medium">FILTERS</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <FilterSection
            title="TYPE"
            filterKey="type"
            options={['Brand', 'Store']}
          />
          
          <FilterSection
            title="PRICE RANGE"
            filterKey="priceRange"
            options={['$', '$$', '$$$', '$$$$']}
          />
          
          <FilterSection
            title="DISCOUNT"
            filterKey="discount"
            options={[
              'Up to 25% off',
              '25-35% off',
              '35-50% off',
              '50%+ off'
            ]}
          />
          
          <FilterSection
            title="MAX SIZE (WOMEN)"
            filterKey="maxWomensSize"
            options={[
              'Up to 10',
              'Up to 12',
              'Up to 14',
              'Up to 16',
              'Up to 18+'
            ]}
          />
          
          <FilterSection
            title="VALUES"
            filterKey="values"
            options={[
              'Sustainable',
              'Women-Owned',
              'BIPOC-Owned',
              'Fair Trade'
            ]}
          />
        </div>
      </div>

      {/* Backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/10 z-40 transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
