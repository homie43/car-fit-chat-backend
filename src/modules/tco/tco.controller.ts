import { Request, Response } from 'express';
import { z } from 'zod';
import { tcoService } from './tco.service';
import { logger } from '@/shared/utils/logger';

// Validation schema
const getTCOSchema = z.object({
  vin: z.string().min(17).max(17).regex(/^[A-HJ-NPR-Z0-9]{17}$/i, {
    message: 'Invalid VIN format (must be 17 characters, A-Z, 0-9, no I/O/Q)',
  }),
});

export class TCOController {
  /**
   * GET /tco/by-vin?vin=...
   * Calculate TCO (Total Cost of Ownership) for a vehicle by VIN
   */
  async getTCOByVIN(req: Request, res: Response): Promise<void> {
    try {
      // Validate query parameters
      const { vin } = getTCOSchema.parse(req.query);

      logger.info({ vin }, 'TCO request received');

      // Calculate TCO
      const tcoData = await tcoService.calculateTCO(vin);

      if (!tcoData) {
        res.status(404).json({
          error: 'TCO_NOT_FOUND',
          message: 'Could not calculate TCO for the provided VIN',
        });
        return;
      }

      res.status(200).json(tcoData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn({ error: error.issues }, 'Invalid TCO request');
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.issues[0].message,
          details: error.issues,
        });
        return;
      }

      logger.error({ error }, 'TCO calculation error');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to calculate TCO',
      });
    }
  }

  /**
   * GET /tco/decode?vin=...
   * Decode VIN to get vehicle information
   */
  async decodeVIN(req: Request, res: Response): Promise<void> {
    try {
      // Validate query parameters
      const { vin } = getTCOSchema.parse(req.query);

      logger.info({ vin }, 'VIN decode request received');

      // Decode VIN
      const vinData = await tcoService.decodeVIN(vin);

      if (!vinData.isValid) {
        res.status(400).json({
          error: 'INVALID_VIN',
          message: vinData.error || 'Invalid VIN',
        });
        return;
      }

      res.status(200).json(vinData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn({ error: error.issues }, 'Invalid VIN decode request');
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.issues[0].message,
          details: error.issues,
        });
        return;
      }

      logger.error({ error }, 'VIN decode error');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to decode VIN',
      });
    }
  }
}

export const tcoController = new TCOController();
