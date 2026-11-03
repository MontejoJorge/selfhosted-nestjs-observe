import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader } from '@/components/page';
import { Panel, PanelBody } from '@/components/panel';
import { EmptyState, NoTelemetryHint } from '@/components/states';
import { ProjectTitle } from '@/features/projects/project-title';
import { useScope } from '@/lib/scope-hooks';
import { useSuspenseQuery } from '@tanstack/react-query';
import { MapGraph } from './map-graph';
import { MapLegend } from './map-legend';
import { mapQueryOptions } from './queries';

/** Which applications, queues, databases and external services talk to each other. */
export function MapPage() {
  const scope = useScope();
  const { data } = useSuspenseQuery(mapQueryOptions(scope));

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Follow incoming traffic through your apps, the queues between them and the services they call.">
          Map
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      {data.nodes.length === 0 ? (
        <EmptyState title="Nothing to map in this time range">
          <p className="mb-3">
            The map is drawn from the requests, jobs and spans your applications
            send.
          </p>
          <NoTelemetryHint />
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          <Panel className="map-surface border-map-frame">
            <PanelBody className="flex flex-col gap-4 px-4 pt-2 pb-4">
              <MapGraph map={data} />
              <MapLegend />
              {data.sampled ? (
                <p className="font-mono text-[10px] text-map-meta">
                  Busy range: dotted links and client traffic are estimated from
                  the latest executions, not counted one by one.
                </p>
              ) : null}
            </PanelBody>
          </Panel>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each query and outgoing HTTP call an app records adds its database
            or third-party API to the map. A dotted line is deduced, not
            recorded: two runs turned up in the same trace, such as a request
            that put a job on a queue or an app that called another one. Lines
            go pink once more than 1% of their runs fail, and red past 5%.
          </p>
        </div>
      )}
    </Page>
  );
}
