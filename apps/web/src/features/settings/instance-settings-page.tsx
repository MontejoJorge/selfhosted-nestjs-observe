import { Page, PageHeader, PageTitle } from '@/components/page';
import { UpdatesPanel } from '@/features/updates/updates-panel';

/** Settings of the whole collector, outside any project. */
export function InstanceSettingsPage() {
  return (
    <Page>
      <PageHeader>
        <PageTitle subtitle="Settings of this collector, shared by every project.">
          Collector settings
        </PageTitle>
      </PageHeader>
      <UpdatesPanel />
    </Page>
  );
}
