import { useState } from 'react';
import { FilterOptions } from '../types';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
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
      <div className="border-b border-border">
        <button
          onClick={() => toggleSection(filterKey)}
          className="w-full flex items-center justify-between py-4 px-0 text-left hover:opacity-70 transition-opacity"
        >
          <span className="text-sm tracking-wider uppercase" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            {title}
          </span>
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        
        {isExpanded && (
          <div className="pb-4 space-y-3">
            {options.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  id={`${filterKey}-${option}`}
                  checked={filters[filterKey].includes(option)}
                  onCheckedChange={(checked: boolean) =>
                    handleCheckboxChange(filterKey, option, checked)
                  }
                />
                <Label
                  htmlFor={`${filterKey}-${option}`}
                  className="text-sm cursor-pointer"
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
        className="flex items-center gap-2 px-6 py-3 border border-border bg-background hover:bg-muted transition-colors"
        style={{ fontFamily: 'DM Sans, sans-serif' }}
      >
        {isOpen ? (
          <>
            <X className="w-4 h-4" />
            <span className="text-sm tracking-wider uppercase">HIDE FILTERS</span>
          </>
        ) : (
          <>
            <Menu className="w-4 h-4" />
            <span className="text-sm tracking-wider uppercase">FILTER</span>
          </>
        )}
      </button>

      {isOpen && (
        <div 
          className="fixed left-0 top-0 w-80 h-full bg-background border-r border-border overflow-y-auto z-50 p-6"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg tracking-wider uppercase font-medium">FILTERS</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-muted rounded transition-colors"
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
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
