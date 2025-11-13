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
  activeOnly: boolean;
};

interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
}

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-8 items-center text-sm" style={{ fontFamily: 'Crimson Pro, serif' }}>
      <Select
        value={filters.discountRange}
        onValueChange={(value) =>
          onFilterChange({ ...filters, discountRange: value })
        }
      >
        <SelectTrigger className="w-[200px] h-10 border-border">
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

      <div className="flex items-center gap-2.5">
        <Checkbox
          id="active-only"
          checked={filters.activeOnly}
          onCheckedChange={(checked) =>
            onFilterChange({ ...filters, activeOnly: checked as boolean })
          }
        />
        <label
          htmlFor="active-only"
          className="text-sm cursor-pointer select-none"
        >
          Active Now
        </label>
      </div>
    </div>
  );
}
