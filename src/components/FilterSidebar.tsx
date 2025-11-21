import { useState } from 'react';
import { FilterOptions } from '../types';
import { Checkbox } from './ui/checkbox';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface FilterSidebarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  isOpen: boolean;
}

export function FilterSidebar({ filters, onFilterChange, isOpen }: FilterSidebarProps) {
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
    <div 
      className="bg-white overflow-hidden transition-all duration-300 ease-in-out"
      style={{ 
        fontFamily: 'DM Sans, sans-serif',
        width: isOpen ? '280px' : '0px',
        paddingLeft: isOpen ? '24px' : '0px',
        opacity: isOpen ? 1 : 0,
        borderLeft: isOpen ? '1px solid var(--border)' : 'none',
        transform: isOpen ? 'translateX(0)' : 'translateX(280px)'
      }}
    >
      <div className="mb-8" style={{ minWidth: '256px' }}>
        <h2 className="text-sm tracking-widest uppercase font-medium">FILTERS</h2>
      </div>

      <div style={{ minWidth: '256px' }}>
        <FilterSection
          title="TYPE"
          filterKey="type"
          options={['Brand', 'Shop']}
        />
        
        {/* Has Picks - Standalone section with header styling */}
        <div className="mb-6">
          <div className="flex items-center justify-between py-3 px-0">
            <label
              htmlFor="has-picks"
              className="text-sm cursor-pointer leading-none tracking-widest uppercase"
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontWeight: 500
              }}
            >
              HAS PICKS
            </label>
            <Checkbox
              id="has-picks"
              checked={filters.type.includes('Has picks')}
              onCheckedChange={(checked: boolean) =>
                handleCheckboxChange('type', 'Has picks', checked)
              }
              className="w-4 h-4 flex-shrink-0"
            />
          </div>
        </div>
        
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
            'Female-founded',
            'Independent label',
            'Ethical manufacturing',
            'Secondhand',
            'BIPOC-founded'
          ]}
        />
      </div>
    </div>
  );
}
