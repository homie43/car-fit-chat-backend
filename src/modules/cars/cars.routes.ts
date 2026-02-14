import { Router } from 'express';
import { CarsController } from './cars.controller';

const router = Router();
const carsController = new CarsController();

/**
 * @route   GET /cars/brands
 * @desc    Get all car brands
 * @access  Public
 */
router.get('/brands', carsController.getBrands.bind(carsController));

/**
 * @route   GET /cars/models?brand=:brandIdOrCode
 * @desc    Get models by brand
 * @access  Public
 */
router.get('/models', carsController.getModels.bind(carsController));

/**
 * @route   GET /cars/search?marka=&model=&yearFrom=&yearTo=&power=&kpp=&bodyType=
 * @desc    Search cars by multiple parameters
 * @access  Public (used by AI service)
 */
router.get('/search', carsController.searchCars.bind(carsController));

/**
 * @route   GET /cars/variants/:id
 * @desc    Get variant by ID with full details
 * @access  Public
 */
router.get('/variants/:id', carsController.getVariantById.bind(carsController));

export default router;
