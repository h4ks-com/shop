export type ArticleVariant = {
  id: number;
  productTypeId: number;
  productTypeName: string;
  appearanceId: number;
  appearanceName: string;
  appearanceColorValue: string;
  sizeId: number;
  sizeName: string;
  sku: string;
  d2cPrice: number;
  b2bPrice: number;
  imageIds: number[];
  stock?: number;
};

export type ArticleImage = {
  id: number;
  appearanceId: number;
  appearanceName: string;
  perspective: string;
  imageUrl: string;
};

export type Article = {
  id: number;
  title: string;
  description: string;
  variants: ArticleVariant[];
  images: ArticleImage[];
};

export type ListArticlesResponse = {
  items: Article[];
  count: number;
  limit: number;
  offset: number;
};

export type Address = {
  company?: string;
  firstName: string;
  lastName: string;
  street: string;
  streetAnnex?: string;
  city: string;
  state?: string;
  zipCode: string;
  country: string; // ISO-2
};

export type CustomerPrice = {
  amount: number;
  currency: string;
  taxRate: number;
  taxType: "SALESTAX" | "VAT" | "NOT_TAXABLE";
};

export type CreateOrderRequest = {
  orderItems: Array<{
    sku: string;
    quantity: number;
    customerPrice: CustomerPrice;
  }>;
  shipping: { address: Address };
  billingAddress?: Address;
  phone: string;
  email: string;
  externalOrderReference: string;
  state?: "NEW" | "CONFIRMED";
  customerTaxType?: CustomerPrice["taxType"];
  origin?: string;
};

export type SpreadconnectOrder = {
  id: number;
  orderReference: number;
  externalOrderReference: string;
  state: "NEW" | "CONFIRMED" | "PROCESSED" | "CANCELLED";
  email?: string;
  phone?: string;
};
