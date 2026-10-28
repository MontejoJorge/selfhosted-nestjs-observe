import { Module } from '@nestjs/common';
import { ApiKeyAuthenticator } from './api-key-authenticator.js';

/** Ingest authentication by API key; shared by the ingest and projects modules. */
@Module({
  providers: [ApiKeyAuthenticator],
  exports: [ApiKeyAuthenticator],
})
export class ApiKeysModule {}
