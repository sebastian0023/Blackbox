import { ApiSecurity } from '@nestjs/swagger';

export function ApiSessionAuth(): MethodDecorator {
  return ApiSecurity({ session: [] });
}

export function ApiSessionAndCsrfAuth(): MethodDecorator {
  return ApiSecurity({ csrf: [], session: [] });
}
