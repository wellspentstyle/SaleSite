import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Checkbox } from './ui/checkbox';

export type FilterOptions = {
  discountRange: string;
  priceRange: string;
  companyType: string;
  maxWomensSize: string;
  values: string[];
};

interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
}

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  const toggleValue = (value: string) => {
    const newValues = filters.values.includes(value)
      ? filters.values.filter(v => v !== value)
      : [...filters.values, value];
    onFilterChange({ ...filters, values: newValues });
  };

  return (
    <div className="flex flex-wrap gap-6 items-center text-sm" style={{ fontFamily: 'Crimson Pro, serif' }}>
      {/* Discount Range */}
      <Select
        value={filters.discountRange}
        onValueChange={(value: string) =>
          onFilterChange({ ...filters, discountRange: value })
        }
      >
        <SelectTrigger className="w-[180px] h-10 border-border">
          <SelectValue placeholder="All discounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Discounts</SelectItem>
          <SelectItem value="0-25">Up to 25% Off</SelectItem>
          <SelectItem value="25-35">25-35% Off</SelectItem>
          <SelectItem value="35-50">35-50% Off</SelectItem>
          <SelectItem value="50+">50%+ Off</SelectItem>
        </SelectContent>
      </Select>

      {/* Price Range */}
      <Select
        value={filters.priceRange}
        onValueChange={(value: string) =>
          onFilterChange({ ...filters, priceRange: value })
        }
      >
        <SelectTrigger className="w-[180px] h-10 border-border">
          <SelectValue placeholder="All prices" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Prices</SelectItem>
          <SelectItem value="Budget">Budget</SelectItem>
          <SelectItem value="Mid">Mid-Range</SelectItem>
          <SelectItem value="Luxury">Luxury</SelectItem>
        </SelectContent>
      </Select>

      {/* Brand vs Store */}
      <Select
        value={filters.companyType}
        onValueChange={(value: string) =>
          onFilterChange({ ...filters, companyType: value })
        }
      >
        <SelectTrigger className="w-[180px] h-10 border-border">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="Brand">Brands</SelectItem>
          <SelectItem value="Store">Stores</SelectItem>
        </SelectContent>
      </Select>

      {/* Max Women's Size */}
      <Select
        value={filters.maxWomensSize}
        onValueChange={(value: string) =>
          onFilterChange({ ...filters, maxWomensSize: value })
        }
      >
        <SelectTrigger className="w-[180px] h-10 border-border">
          <SelectValue placeholder="All sizes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Sizes</SelectItem>
          <SelectItem value="Plus">Plus Size (14+)</SelectItem>
        </SelectContent>
      </Select>

      {/* Values - Multi-select with checkboxes */}
      <div className="flex flex-wrap gap-4">
        {['Sustainable', 'Women-Owned', 'BIPOC-Owned', 'Fair Trade'].map((value) => (
          <div key={value} className="flex items-center gap-2">
            <Checkbox
              id={`value-${value}`}
              checked={filters.values.includes(value)}
              onCheckedChange={() => toggleValue(value)}
            />
            <label
              htmlFor={`value-${value}`}
              className="text-sm cursor-pointer select-none"
            >
              {value}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
