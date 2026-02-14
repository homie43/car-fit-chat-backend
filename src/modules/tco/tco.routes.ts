import { Router } from 'express';
import { tcoController } from './tco.controller';
import { authMiddleware } from '@/shared/middleware/auth.middleware';

const router = Router();

/**
 * All TCO routes require authentication
 */
router.use(authMiddleware);

/**
 * GET /tco/by-vin?vin=XXXXXXXXXXXXXXXXX
 * Calculate Total Cost of Ownership for a vehicle
 */
router.get('/by-vin', (req, res) => tcoController.getTCOByVIN(req, res));

/**
 * GET /tco/decode?vin=XXXXXXXXXXXXXXXXX
 * Decode VIN to get vehicle information
 */
router.get('/decode', (req, res) => tcoController.decodeVIN(req, res));

export default router;
