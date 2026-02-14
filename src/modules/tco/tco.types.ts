/**
 * TCO (Total Cost of Ownership) module types
 */

export interface VINDecodeResult {
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  trim?: string;
  engine?: string;
  transmission?: string;
  isValid: boolean;
  error?: string;
}

export interface TCOCalculation {
  vin: string;
  currency: string;

  // Cost breakdown
  depreciation: number;
  fuel: number;
  insurance: number;
  maintenance: number;
  repairs: number;
  taxes: number;

  // Totals
  totalFirstYear: number;
  totalFiveYears: number;
  averagePerYear: number;

  // Additional info
  calculatedAt: Date;
  dataSource: 'AUTO_DEV' | 'MOCK';
}

export interface TCOResponse {
  vin: string;
  vehicle: {
    make: string;
    model: string;
    year: number;
  };
  tco: {
    currency: string;
    fiveYearTotal: number;
    averagePerYear: number;
    breakdown: {
      depreciation: number;
      fuel: number;
      insurance: number;
      maintenance: number;
      repairs: number;
      taxes: number;
    };
  };
  cached: boolean;
  calculatedAt: string;
}
