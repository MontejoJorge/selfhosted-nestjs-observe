import { KeyValue, KeyValueList } from '@/components/data/key-value';
import { RelativeTime } from '@/components/data/relative-time';
import { FormError } from '@/components/form';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { UpdateStatusDto } from '@/lib/api/generated/api';
import { formatDateTime } from '@/lib/format';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { ArrowUpRightIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  checkForUpdatesMutation,
  updateSettingsMutation,
  updateStatusQueryOptions,
} from './queries';

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-primary hover:underline"
    >
      {children}
      <ArrowUpRightIcon className="size-3" aria-hidden />
    </a>
  );
}

function LatestValue({ status }: { status: UpdateStatusDto }) {
  if (status.latestVersion && status.latestUrl)
    return (
      <ExternalLink href={status.latestUrl}>
        {status.latestVersion}
      </ExternalLink>
    );
  // A successful check that found nothing: no release yet, or the repository is gone.
  if (status.checkedAt && !status.error)
    return <span className="text-muted-foreground">No release found</span>;
  return <span className="text-muted-foreground">–</span>;
}

function Verdict({ status }: { status: UpdateStatusDto }) {
  if (status.updateAvailable && status.latestUrl)
    return (
      <p className="text-sm">
        <strong>{status.latestVersion}</strong> is available.{' '}
        <ExternalLink href={status.latestUrl}>See the release</ExternalLink>
      </p>
    );
  if (status.enabled && status.latestVersion && !status.error)
    return <p className="text-sm text-muted-foreground">You are up to date.</p>;
  return null;
}

/** Running version, latest release and the switch of the 12-hourly check. */
export function UpdatesPanel() {
  const queryClient = useQueryClient();
  const { data: status } = useSuspenseQuery(updateStatusQueryOptions());
  const store = (next: UpdateStatusDto) =>
    queryClient.setQueryData(updateStatusQueryOptions().queryKey, next);

  const settings = useMutation({
    ...updateSettingsMutation(),
    onSuccess: (next) => {
      store(next);
      toast.success(
        next.enabled ? 'Update check turned on' : 'Update check turned off',
      );
    },
  });
  const check = useMutation({
    ...checkForUpdatesMutation(),
    onSuccess: (next) => {
      store(next);
      if (next.error) toast.error('Could not reach GitHub');
      else if (next.updateAvailable)
        toast.success(`${next.latestVersion} is available`);
      else toast.success('You are up to date');
    },
  });

  return (
    <Panel>
      <PanelHeader title="Updates" />
      <PanelBody className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-6">
          <div className="max-w-xl text-sm">
            <label htmlFor="update-check" className="font-medium">
              Check for new versions
            </label>
            <p className="text-muted-foreground">
              Every 12 hours the collector asks GitHub for its latest release.
              Nothing about your telemetry is sent.
            </p>
          </div>
          <Switch
            id="update-check"
            checked={status.enabled}
            disabled={status.disabledByEnv || settings.isPending}
            onCheckedChange={(enabled) => settings.mutate(enabled)}
          />
        </div>
        {status.disabledByEnv ? (
          <p className="text-xs text-muted-foreground">
            Turned off by <code className="font-mono">UPDATE_CHECK=false</code>{' '}
            in the collector's environment.
          </p>
        ) : null}

        <KeyValueList>
          <KeyValue label="Running">
            v{status.currentVersion.replace(/^v/, '')}
          </KeyValue>
          <KeyValue label="Latest release">
            <LatestValue status={status} />
          </KeyValue>
          <KeyValue label="Last checked">
            {status.checkedAt ? (
              <span title={formatDateTime(status.checkedAt)}>
                <RelativeTime iso={status.checkedAt} />
              </span>
            ) : (
              <span className="text-muted-foreground">Never</span>
            )}
          </KeyValue>
          {status.error ? (
            <KeyValue label="Last error" tone="error">
              {status.error}
            </KeyValue>
          ) : null}
        </KeyValueList>

        <Verdict status={status} />
        <FormError error={settings.error ?? check.error} />

        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="outline"
            disabled={!status.enabled || check.isPending}
            onClick={() => check.mutate()}
          >
            {check.isPending ? 'Checking…' : 'Check now'}
          </Button>
          <ExternalLink href={status.releasesUrl}>All releases</ExternalLink>
        </div>
      </PanelBody>
    </Panel>
  );
}
