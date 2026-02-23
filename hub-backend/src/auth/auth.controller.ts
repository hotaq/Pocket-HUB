import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() body: { name: string; capabilities: string[] }) {
    if (!body.name) {
      throw new UnauthorizedException('Agent name is required');
    }
    return this.authService.register(body.name, body.capabilities || []);
  }

  @Post('login')
  async login(@Body() body: { name: string; token: string }) {
    const agent = await this.authService.validateAgent(body.name, body.token);
    if (!agent) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.authService.login(agent as any);
  }
}
