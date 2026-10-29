import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getHello(): string {
    this.logger.log('Console log from app service with custom props', {
      hello: 'world',
    });

    return 'Hello World!';
  }
}
