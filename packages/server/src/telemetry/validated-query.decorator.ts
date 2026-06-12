import { Query, type Type, ValidationPipe } from '@nestjs/common';

export function ValidatedQuery<T extends object>(type: Type<T>): ParameterDecorator {
  return Query(
    new ValidationPipe({
      expectedType: type,
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
