export interface SalePick {
  id: string;
  name: string;
  brand?: string;
  url: string;
  imageUrl: string;
  originalPrice: number;
  salePrice: number;
  percentOff: number;
  shopMyUrl: string;
  availabilityStatus?: 'In Stock' | 'Low' | 'Sold Out' | 'Unknown';
  lastValidatedAt?: string;
  nextCheckDue?: string;
  hiddenUntilFresh?: boolean;
}

export interface Sale {
  id: string;
  brandName: string;
  brandLogo: string;
  discount: string;
  discountCode?: string;
  startDate?: string;
  endDate?: string;
  saleUrl: string;
  heroImage?: string;
  imageUrl?: string;
  featured?: boolean;
  createdTime?: string;
  picks: SalePick[];
  // Company filtering metadata
  priceRange?: string;
  companyType?: string;
  maxWomensSize?: string;
  values?: string[];
  description?: string;
}

export interface FilterOptions {
  type: string[];
  priceRange: string[];
  discount: string[];
  maxWomensSize: string[];
  values: string[];
}

export type SortOption = 
  | 'featured'
  | 'alphabetically-a-z'
  | 'alphabetically-z-a'
  | 'discount-high-low'
  | 'date-old-new'
  | 'date-new-old';
