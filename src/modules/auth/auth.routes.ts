import { Router } from 'express';
import { AuthController } from './auth.controller';

const router = Router();
const authController = new AuthController();

/**
 * @route   POST /auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', authController.register.bind(authController));

/**
 * @route   POST /auth/login
 * @desc    Login user and get access token
 * @access  Public
 */
router.post('/login', authController.login.bind(authController));

/**
 * @route   POST /auth/refresh
 * @desc    Refresh access token using refresh token from cookie
 * @access  Public
 */
router.post('/refresh', authController.refresh.bind(authController));

/**
 * @route   POST /auth/logout
 * @desc    Logout user and clear refresh token
 * @access  Public
 */
router.post('/logout', authController.logout.bind(authController));

export default router;
