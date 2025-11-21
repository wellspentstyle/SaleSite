import { useState } from 'react';
import { FilterOptions } from '../types';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { ChevronDown, ChevronRight, Filter, X } from 'lucide-react';

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
      <div className="border-b border-border last:border-b-0">
        <button
          onClick={() => toggleSection(filterKey)}
          className="w-full flex items-center justify-between py-3 px-0 text-left hover:opacity-70 transition-opacity"
        >
          <span className="text-xs tracking-widest uppercase font-normal" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            {title}
          </span>
          {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
        </button>
        
        {isExpanded && (
          <div className="pb-3 space-y-2.5">
            {options.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  id={`${filterKey}-${option}`}
                  checked={filters[filterKey].includes(option)}
                  onCheckedChange={(checked: boolean) =>
                    handleCheckboxChange(filterKey, option, checked)
                  }
                  className="w-4 h-4"
                />
                <Label
                  htmlFor={`${filterKey}-${option}`}
                  className="text-sm cursor-pointer font-normal leading-none"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {option}
                </Label>
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
        className="flex items-center gap-2 px-4 py-2.5 border border-border bg-background hover:bg-muted transition-colors"
        style={{ fontFamily: 'DM Sans, sans-serif' }}
      >
        <Filter className="w-4 h-4" />
        <span className="text-xs tracking-widest uppercase font-normal">FILTER</span>
      </button>

      {isOpen && (
        <div 
          className="fixed right-0 top-0 w-72 h-full bg-white border-l border-border overflow-y-auto z-50 p-6"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm tracking-widest uppercase font-medium">FILTERS</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-0">
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
