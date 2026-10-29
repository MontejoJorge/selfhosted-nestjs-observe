import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader } from '@/components/page';
import { ProjectTitle } from '@/features/projects/project-title';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { servicesQueryOptions } from './queries';
import { filterServices, servicesSearch } from './search';
import { ServicesFilters } from './services-filters';
import { ServicesTable } from './services-table';

/** Own and total time per class of the applications, from the spans of every trace. */
export function ServicesPage() {
  const scope = useScope();
  const [search, setSearch] = useTypedSearch(servicesSearch);
  const { data } = useSuspenseQuery(servicesQueryOptions(scope));
  const services = useMemo(
    () => filterServices(data.services, search),
    [data, search],
  );
  const filtered =
    search.className !== undefined ||
    search.ownMs !== undefined ||
    search.totalMs !== undefined;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Which of your NestJS classes actually burn the time.">
          Services
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <ServicesFilters
        services={data.services}
        search={search}
        onChange={setSearch}
      />

      <div className="flex flex-col gap-3">
        <ServicesTable
          key={JSON.stringify([scope, search])}
          services={services}
          emptyMessage={
            filtered
              ? 'No class matches these filters.'
              : 'No spans in this time range. Classes show up once their applications send traces.'
          }
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Own time</span> is
          time spent in a class's own code with nested calls subtracted, where
          the time is actually going.{' '}
          <span className="font-semibold text-foreground">Total time</span>{' '}
          includes everything awaited further down, so a controller can top it
          while doing no work of its own. Outgoing database and HTTP calls are
          not classes and are left out, so neither sums to a request's full
          latency.
        </p>
      </div>
    </Page>
  );
}
