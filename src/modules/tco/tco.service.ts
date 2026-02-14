import { prisma } from '@/shared/utils/prisma';
import { logger } from '@/shared/utils/logger';
import { VINDecodeResult, TCOCalculation, TCOResponse } from './tco.types';

export class TCOService {
  private readonly VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;
  private readonly CACHE_DURATION_DAYS = 30;

  /**
   * Validate VIN format (17 characters, no I, O, Q)
   */
  validateVIN(vin: string): boolean {
    return this.VIN_REGEX.test(vin);
  }

  /**
   * Decode VIN (MOCK implementation for MVP)
   * In production, this would call auto.dev VIN decode API
   */
  async decodeVIN(vin: string): Promise<VINDecodeResult> {
    const startTime = Date.now();

    try {
      if (!this.validateVIN(vin)) {
        return {
          vin,
          isValid: false,
          error: 'Invalid VIN format (must be 17 characters, A-Z, 0-9, no I/O/Q)',
        };
      }

      // MOCK: Extract year and basic info from VIN structure
      // In production: GET https://api.auto.dev/vin/{vin}
      const yearCode = vin.charAt(9);
      const mockYear = this.decodeYearFromVIN(yearCode);

      // Mock vehicle data based on VIN
      const mockData: VINDecodeResult = {
        vin,
        make: this.mockMakeFromVIN(vin),
        model: 'Model ' + vin.substring(3, 6).toUpperCase(),
        year: mockYear,
        trim: 'Standard',
        engine: '2.0L I4',
        transmission: 'Automatic',
        isValid: true,
      };

      // Log to provider_logs
      await this.logProviderRequest(
        'VIN_DECODE',
        { vin },
        mockData,
        Date.now() - startTime
      );

      logger.info({ vin, mockData }, 'VIN decoded (mock)');

      return mockData;
    } catch (error) {
      logger.error({ error, vin }, 'VIN decode error');
      return {
        vin,
        isValid: false,
        error: 'Failed to decode VIN',
      };
    }
  }

  /**
   * Calculate TCO (MOCK implementation for MVP)
   * In production, this would call auto.dev TCO API
   */
  async calculateTCO(vin: string): Promise<TCOResponse | null> {
    const startTime = Date.now();

    try {
      // 1. Check cache first
      const cached = await this.getCachedTCO(vin);
      if (cached) {
        logger.info({ vin }, 'TCO retrieved from cache');
        return cached;
      }

      // 2. Decode VIN
      const vinDecoded = await this.decodeVIN(vin);
      if (!vinDecoded.isValid) {
        return null;
      }

      // 3. MOCK: Calculate TCO
      // In production: GET https://api.auto.dev/tco/{vin}
      const tcoData = this.mockTCOCalculation(vinDecoded);

      // 4. Cache the result
      await this.cacheTCO(vin, tcoData);

      // 5. Log to provider_logs
      await this.logProviderRequest(
        'TCO_CALCULATE',
        { vin },
        tcoData,
        Date.now() - startTime
      );

      // 6. Format response
      const response: TCOResponse = {
        vin,
        vehicle: {
          make: vinDecoded.make || 'Unknown',
          model: vinDecoded.model || 'Unknown',
          year: vinDecoded.year || 2020,
        },
        tco: {
          currency: tcoData.currency,
          fiveYearTotal: tcoData.totalFiveYears,
          averagePerYear: tcoData.averagePerYear,
          breakdown: {
            depreciation: tcoData.depreciation,
            fuel: tcoData.fuel,
            insurance: tcoData.insurance,
            maintenance: tcoData.maintenance,
            repairs: tcoData.repairs,
            taxes: tcoData.taxes,
          },
        },
        cached: false,
        calculatedAt: new Date().toISOString(),
      };

      logger.info({ vin, tco: response.tco }, 'TCO calculated (mock)');

      return response;
    } catch (error) {
      logger.error({ error, vin }, 'TCO calculation error');
      return null;
    }
  }

  /**
   * Get cached TCO from database
   */
  private async getCachedTCO(vin: string): Promise<TCOResponse | null> {
    try {
      const cached = await prisma.tcoCache.findUnique({
        where: { vin },
      });

      if (!cached) {
        return null;
      }

      // Check if cache expired (30 days)
      const expiresAt = new Date(cached.expiresAt);
      if (expiresAt < new Date()) {
        logger.debug({ vin }, 'TCO cache expired');
        return null;
      }

      // Parse cached data
      const raw = cached.raw as any;

      return {
        vin,
        vehicle: {
          make: raw.vehicle?.make || 'Unknown',
          model: raw.vehicle?.model || 'Unknown',
          year: raw.vehicle?.year || 2020,
        },
        tco: {
          currency: cached.currency,
          fiveYearTotal: Number(cached.tcoValue),
          averagePerYear: Number(cached.tcoValue) / 5,
          breakdown: raw.breakdown || {},
        },
        cached: true,
        calculatedAt: cached.fetchedAt.toISOString(),
      };
    } catch (error) {
      logger.error({ error, vin }, 'Failed to get cached TCO');
      return null;
    }
  }

  /**
   * Cache TCO result in database
   */
  private async cacheTCO(vin: string, tcoData: TCOCalculation): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.CACHE_DURATION_DAYS);

      await prisma.tcoCache.upsert({
        where: { vin },
        update: {
          tcoValue: tcoData.totalFiveYears,
          currency: tcoData.currency,
          raw: {
            breakdown: {
              depreciation: tcoData.depreciation,
              fuel: tcoData.fuel,
              insurance: tcoData.insurance,
              maintenance: tcoData.maintenance,
              repairs: tcoData.repairs,
              taxes: tcoData.taxes,
            },
            dataSource: tcoData.dataSource,
          } as any,
          fetchedAt: new Date(),
          expiresAt,
        },
        create: {
          vin,
          tcoValue: tcoData.totalFiveYears,
          currency: tcoData.currency,
          raw: {
            breakdown: {
              depreciation: tcoData.depreciation,
              fuel: tcoData.fuel,
              insurance: tcoData.insurance,
              maintenance: tcoData.maintenance,
              repairs: tcoData.repairs,
              taxes: tcoData.taxes,
            },
            dataSource: tcoData.dataSource,
          } as any,
          fetchedAt: new Date(),
          expiresAt,
        },
      });

      logger.debug({ vin, expiresAt }, 'TCO cached');
    } catch (error) {
      logger.error({ error, vin }, 'Failed to cache TCO');
    }
  }

  /**
   * MOCK: Generate TCO calculation based on vehicle info
   */
  private mockTCOCalculation(vinDecoded: VINDecodeResult): TCOCalculation {
    // Mock calculation based on year (newer = more expensive)
    const year = vinDecoded.year || 2020;
    const age = new Date().getFullYear() - year;

    // Base costs (in RUB)
    const depreciation = Math.max(200000 - age * 30000, 50000) * 5;
    const fuel = 150000 * 5; // 150k per year
    const insurance = 50000 * 5; // 50k per year
    const maintenance = 40000 * 5; // 40k per year
    const repairs = Math.min(age * 15000, 100000) * 5;
    const taxes = 15000 * 5; // 15k per year

    const totalFiveYears =
      depreciation + fuel + insurance + maintenance + repairs + taxes;

    return {
      vin: vinDecoded.vin,
      currency: 'RUB',
      depreciation,
      fuel,
      insurance,
      maintenance,
      repairs,
      taxes,
      totalFirstYear: totalFiveYears / 5,
      totalFiveYears,
      averagePerYear: totalFiveYears / 5,
      calculatedAt: new Date(),
      dataSource: 'MOCK',
    };
  }

  /**
   * Log provider request to database
   */
  private async logProviderRequest(
    kind: 'VIN_DECODE' | 'TCO_CALCULATE',
    request: any,
    response: any,
    latencyMs: number
  ): Promise<void> {
    try {
      await prisma.providerLog.create({
        data: {
          kind: 'AUTO_DEV',
          request: request as any,
          response: { ...response, kind } as any,
          status: 'SUCCESS',
          latencyMs,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to log provider request');
    }
  }

  /**
   * Decode year from VIN character (simplified)
   */
  private decodeYearFromVIN(yearCode: string): number {
    const yearMap: Record<string, number> = {
      A: 2010,
      B: 2011,
      C: 2012,
      D: 2013,
      E: 2014,
      F: 2015,
      G: 2016,
      H: 2017,
      J: 2018,
      K: 2019,
      L: 2020,
      M: 2021,
      N: 2022,
      P: 2023,
      R: 2024,
    };

    return yearMap[yearCode.toUpperCase()] || 2020;
  }

  /**
   * Mock make from VIN (first 3 characters)
   */
  private mockMakeFromVIN(vin: string): string {
    const wmi = vin.substring(0, 3).toUpperCase();

    // Mock WMI to make mapping
    const makeMap: Record<string, string> = {
      '1G1': 'Chevrolet',
      '1FA': 'Ford',
      '1HG': 'Honda',
      '2HM': 'Hyundai',
      '3VW': 'Volkswagen',
      '4T1': 'Toyota',
      '5YJ': 'Tesla',
      JTD: 'Toyota',
      WBA: 'BMW',
      WDB: 'Mercedes-Benz',
    };

    return makeMap[wmi] || 'Generic';
  }
}

// Export singleton instance
export const tcoService = new TCOService();
