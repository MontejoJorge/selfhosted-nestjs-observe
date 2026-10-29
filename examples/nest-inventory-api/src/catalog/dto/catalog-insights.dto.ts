export class CategoryStatsDto {
  category: string;
  products: number;
  averagePrice: number | null;
  averageRating: number | null;
}

export class PricedProductDto {
  id: number;
  title: string;
  category: string;
  price: number;
  rating: number;
  stock: number;
  discountPercentage: number;
  /** Price after discount. */
  finalPrice: number;
}

export class LowStockProductDto {
  id: number;
  title: string;
  stock: number;
}

export class CatalogInsightsDto {
  categories: CategoryStatsDto[];
  topRated: PricedProductDto[];
  lowStock: LowStockProductDto[];
}
