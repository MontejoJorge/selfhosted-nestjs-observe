import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import type { UserDetailDto, UsersDto } from './users.dto.js';

export interface UserFilter {
  scope: TelemetryScope;
  window: TimeWindow;
}

/** Read port for the users that requests were made on behalf of. */
export abstract class UsersRepository {
  /** Users with requests in the window, by request count desc, with the activity timeline. */
  abstract list(
    filter: UserFilter & { search?: string; limit: number },
  ): Promise<UsersDto>;
  /** One user's stats and timeline, or null when they have no requests in the window. */
  abstract findById(
    filter: UserFilter,
    userId: string,
  ): Promise<UserDetailDto | null>;
}
