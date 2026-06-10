import { Controller, Get } from '@nestjs/common';

@Controller()
export class ExampleController {
  @Get()
  getWelcome(): { readonly name: string; readonly status: 'ok' } {
    return { name: 'Blackbox example NestJS application', status: 'ok' };
  }
}
