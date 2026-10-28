import type { ServiceSummary } from '@selfhosted-observe/contracts';

/** Read port for known services. */
export abstract class ServicesRepository {
  abstract list(): Promise<ServiceSummary[]>;
}
