import {
  FilterBar,
  OptionFilter,
  SearchableOptionFilter,
} from '@/components/data/filters';
import { jobStatsQueryOptions } from '@/features/jobs/queries';
import { operationsQueryOptions } from '@/features/requests/queries';
import { useScope } from '@/lib/scope-hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { TimeBreakdownSearch } from './search';

const SOURCE_OPTIONS = [
  { value: 'request', label: 'Requests' },
  { value: 'job', label: 'Jobs' },
] as const;

/** Separates queue and job name in a job option's value. */
const JOB_SEPARATOR = '\n';

type Patch = Partial<Record<keyof TimeBreakdownSearch, string | undefined>>;

/**
 * Source, operation (requests) and job (queue + name) filters. Picking an
 * operation narrows to requests and picking a job narrows to jobs.
 */
export function BreakdownFilters({
  search,
  onChange,
}: {
  search: TimeBreakdownSearch;
  onChange: (patch: Patch) => void;
}) {
  const scope = useScope();
  // Non-suspending: the options are a convenience and must not block the page.
  const operations = useQuery(operationsQueryOptions(scope));
  const jobs = useQuery(jobStatsQueryOptions(scope));

  const operationOptions = useMemo(
    () =>
      [...new Set((operations.data ?? []).map((op) => op.operationId))]
        .toSorted()
        .map((id) => ({ value: id, label: id })),
    [operations.data],
  );
  const jobOptions = useMemo(
    () =>
      (jobs.data ?? [])
        .map((job) => ({
          value: `${job.queue}${JOB_SEPARATOR}${job.name}`,
          label: `${job.queue} / ${job.name}`,
        }))
        .toSorted((a, b) => a.label.localeCompare(b.label)),
    [jobs.data],
  );
  const jobValue =
    search.queue && search.name
      ? `${search.queue}${JOB_SEPARATOR}${search.name}`
      : undefined;

  return (
    <FilterBar>
      <OptionFilter
        label="Source"
        value={search.source}
        options={SOURCE_OPTIONS}
        onChange={(source) =>
          onChange({
            source,
            operationId: source === 'job' ? undefined : search.operationId,
            queue: source === 'request' ? undefined : search.queue,
            name: source === 'request' ? undefined : search.name,
          })
        }
      />
      {search.source !== 'job' ? (
        <SearchableOptionFilter
          label="Operation"
          value={search.operationId}
          options={operationOptions}
          emptyText="No operation in this time range."
          onChange={(operationId) =>
            onChange(
              operationId
                ? {
                    operationId,
                    source: 'request',
                    queue: undefined,
                    name: undefined,
                  }
                : { operationId: undefined },
            )
          }
        />
      ) : null}
      {search.source !== 'request' ? (
        <SearchableOptionFilter
          label="Job"
          value={jobValue}
          options={jobOptions}
          emptyText="No job in this time range."
          onChange={(value) => {
            if (!value) {
              onChange({ queue: undefined, name: undefined });
              return;
            }
            const [queue, name] = value.split(JOB_SEPARATOR);
            onChange({ queue, name, source: 'job', operationId: undefined });
          }}
        />
      ) : null}
    </FilterBar>
  );
}
