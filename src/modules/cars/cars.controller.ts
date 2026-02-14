import { Request, Response, NextFunction } from 'express';
import { CarsService } from './cars.service';

const carsService = new CarsService();

export class CarsController {
  async getBrands(req: Request, res: Response, next: NextFunction) {
    try {
      const brands = await carsService.getBrands();
      res.status(200).json(brands);
    } catch (error) {
      next(error);
    }
  }

  async getModels(req: Request, res: Response, next: NextFunction) {
    try {
      const { brand } = req.query;

      if (!brand || typeof brand !== 'string') {
        res.status(400).json({ error: 'Brand parameter is required' });
        return;
      }

      const models = await carsService.getModelsByBrand(brand);
      res.status(200).json(models);
    } catch (error) {
      next(error);
    }
  }

  async searchCars(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        marka,
        model,
        yearFrom,
        yearTo,
        power,
        kpp,
        bodyType,
        limit,
        offset,
      } = req.query;

      const params = {
        marka: marka as string | undefined,
        model: model as string | undefined,
        yearFrom: yearFrom ? parseInt(yearFrom as string) : undefined,
        yearTo: yearTo ? parseInt(yearTo as string) : undefined,
        power: power as string | undefined,
        kpp: kpp as string | undefined,
        bodyType: bodyType as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      };

      const results = await carsService.searchCars(params);

      res.status(200).json({
        results,
        count: results.length,
        params,
      });
    } catch (error) {
      next(error);
    }
  }

  async getVariantById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const variant = await carsService.getVariantById(id);

      if (!variant) {
        res.status(404).json({ error: 'Variant not found' });
        return;
      }

      res.status(200).json(variant);
    } catch (error) {
      next(error);
    }
  }
}
