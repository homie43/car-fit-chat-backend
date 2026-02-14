import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { RegisterDtoSchema, LoginDtoSchema } from './auth.dto';

const authService = new AuthService();

const isProduction = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'strict') as 'none' | 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate request body
      const data = RegisterDtoSchema.parse(req.body);

      // Register user
      const result = await authService.register(data);

      // Set refresh token in httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

      res.status(201).json({
        user: result.user,
        accessToken: result.accessToken,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate request body
      const data = LoginDtoSchema.parse(req.body);

      // Login user
      const result = await authService.login(data);

      // Set refresh token in httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

      res.status(200).json({
        user: result.user,
        accessToken: result.accessToken,
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      // Get refresh token from cookie
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        res.status(401).json({ error: 'No refresh token provided' });
        return;
      }

      // Refresh tokens
      const result = await authService.refresh(refreshToken);

      // Set new refresh token in cookie
      res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

      res.status(200).json({
        accessToken: result.accessToken,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response) {
    // Clear refresh token cookie
    res.clearCookie('refreshToken');
    res.status(200).json({ message: 'Logged out successfully' });
  }
}
