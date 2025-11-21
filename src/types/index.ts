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
}
