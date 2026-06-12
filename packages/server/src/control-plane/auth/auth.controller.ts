import type { ServerConfig } from '@blackbox/config';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { serialize } from 'cookie';
import { SERVER_CONFIG } from '../../health/health.constants';
import { SESSION_COOKIE_NAME } from '../control-plane.constants';
import { ValidatedBody } from '../validated-body.decorator';
import { CurrentPrincipal } from './auth.decorators';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthEstablishedResponseModel, CurrentSessionResponseModel } from './auth.models';
import { AuthService } from './auth.service';
import type { AuthenticatedPrincipal } from './auth.types';
import { CsrfGuard } from './csrf.guard';
import { ApiSessionAndCsrfAuth, ApiSessionAuth } from './openapi-security.decorators';
import { SessionAuthGuard } from './session-auth.guard';

interface HttpResponse {
  setHeader(name: string, value: string): void;
}

@ApiTags('authentication')
@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
  ) {}

  @Post('register')
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: AuthEstablishedResponseModel })
  @ApiConflictResponse({ description: 'The account cannot be registered.' })
  async register(
    @ValidatedBody(RegisterDto) input: RegisterDto,
    @Ip() ipAddress: string,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<AuthEstablishedResponseModel> {
    const established = await this.authService.register(input, ipAddress);
    this.setSessionCookie(response, established.sessionToken, established.expiresAt);
    response.setHeader('Cache-Control', 'no-store');
    return established.body;
  }

  @Post('login')
  @ApiBody({ type: LoginDto })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthEstablishedResponseModel })
  @ApiUnauthorizedResponse({ description: 'The credentials are invalid.' })
  async login(
    @ValidatedBody(LoginDto) input: LoginDto,
    @Ip() ipAddress: string,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<AuthEstablishedResponseModel> {
    const established = await this.authService.login(input, ipAddress);
    this.setSessionCookie(response, established.sessionToken, established.expiresAt);
    response.setHeader('Cache-Control', 'no-store');
    return established.body;
  }

  @Get('session')
  @UseGuards(SessionAuthGuard)
  @ApiSessionAuth()
  @ApiOkResponse({ type: CurrentSessionResponseModel })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  async getSession(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<CurrentSessionResponseModel> {
    response.setHeader('Cache-Control', 'no-store');
    return this.authService.getCurrentSession(principal);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @ApiSessionAndCsrfAuth()
  @ApiNoContentResponse({ description: 'The session was revoked.' })
  async logout(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<void> {
    await this.authService.logout(principal.sessionId);
    this.clearSessionCookie(response);
  }

  private clearSessionCookie(response: HttpResponse): void {
    response.setHeader(
      'Set-Cookie',
      serialize(SESSION_COOKIE_NAME, '', {
        expires: new Date(0),
        httpOnly: true,
        path: '/',
        sameSite: 'strict',
        secure: this.config.nodeEnv !== 'development',
      }),
    );
  }

  private setSessionCookie(response: HttpResponse, sessionToken: string, expiresAt: Date): void {
    response.setHeader(
      'Set-Cookie',
      serialize(SESSION_COOKIE_NAME, sessionToken, {
        expires: expiresAt,
        httpOnly: true,
        path: '/',
        sameSite: 'strict',
        secure: this.config.nodeEnv !== 'development',
      }),
    );
  }
}
