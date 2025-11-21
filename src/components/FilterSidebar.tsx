import { useState } from 'react';
import { FilterOptions } from '../types';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

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
                <Label
                  htmlFor={`${filterKey}-${option}`}
                  className="text-sm cursor-pointer font-normal leading-none uppercase tracking-wide"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {option}
                </Label>
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
        className="flex items-center gap-2 px-4 py-2.5 border border-border bg-background hover:bg-muted transition-colors whitespace-nowrap"
        style={{ fontFamily: 'DM Sans, sans-serif' }}
      >
        <span className="text-xs tracking-widest uppercase font-normal">FILTER</span>
      </button>

      {isOpen && (
        <div 
          className="fixed right-0 top-0 w-80 h-full bg-white border-l border-border overflow-y-auto z-50 p-8"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
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
              options={['BRAND', 'STORE']}
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
                'UP TO 25% OFF',
                '25-35% OFF',
                '35-50% OFF',
                '50%+ OFF'
              ]}
            />
            
            <FilterSection
              title="MAX SIZE (WOMEN)"
              filterKey="maxWomensSize"
              options={[
                'UP TO 10',
                'UP TO 12',
                'UP TO 14',
                'UP TO 16',
                'UP TO 18+'
              ]}
            />
            
            <FilterSection
              title="VALUES"
              filterKey="values"
              options={[
                'SUSTAINABLE',
                'WOMEN-OWNED',
                'BIPOC-OWNED',
                'FAIR TRADE'
              ]}
            />
          </div>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/10 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
