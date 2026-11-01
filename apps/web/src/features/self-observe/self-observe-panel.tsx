import { FormError } from '@/components/form';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import type { SelfObserveStatusDto } from '@/lib/api/generated/api';
import { paths } from '@/lib/paths';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { RotateCwIcon } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { selfObserveQueryOptions, updateSelfObserveMutation } from './queries';

function RestartNotice({ status }: { status: SelfObserveStatusDto }) {
  if (!status.restartRequired) return null;
  return (
    <Alert>
      <RotateCwIcon />
      <AlertTitle>Restart the collector to apply this</AlertTitle>
      <AlertDescription>
        {status.enabled
          ? 'It starts reporting its own telemetry on the next start.'
          : 'It has stopped storing its own telemetry; the agent keeps running until the next start.'}
      </AlertDescription>
    </Alert>
  );
}

function Target({ status }: { status: SelfObserveStatusDto }) {
  if (!status.projectSlug) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Reports to the application{' '}
      <strong className="text-foreground">{status.applicationName}</strong> of
      the project{' '}
      <Link
        to={paths.project(status.projectSlug)}
        className="text-primary hover:underline"
      >
        {status.projectName}
      </Link>
      .
    </p>
  );
}

/** The switch for the collector's own requests, jobs, errors, logs and runtime metrics. */
export function SelfObservePanel() {
  const queryClient = useQueryClient();
  const { data: status } = useSuspenseQuery(selfObserveQueryOptions());
  const update = useMutation({
    ...updateSelfObserveMutation(),
    onSuccess: async (next) => {
      queryClient.setQueryData(selfObserveQueryOptions().queryKey, next);
      // Turning it on may have created the self project.
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(
        next.enabled ? 'Self-observe turned on' : 'Self-observe turned off',
      );
    },
  });
  const fromEnv = status.source === 'env';

  return (
    <Panel>
      <PanelHeader title="Self-observe" />
      <PanelBody className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-6">
          <div className="max-w-xl text-sm">
            <label htmlFor="self-observe" className="font-medium">
              Observe this collector
            </label>
            <p className="text-muted-foreground">
              Creates a project “Observe collector (self)” with an application
              “ingester (self)” and sends them the collector's own requests,
              jobs, errors, logs and runtime metrics, so you can watch the
              ingester like any other app. No API key needed. Changes apply
              after a restart.
            </p>
          </div>
          <Switch
            id="self-observe"
            checked={fromEnv || status.enabled}
            disabled={fromEnv || update.isPending}
            onCheckedChange={(enabled) => update.mutate(enabled)}
          />
        </div>
        {fromEnv ? (
          <p className="text-xs text-muted-foreground">
            The collector reports with{' '}
            <code className="font-mono">OBSERVE_APP_KEY</code> and{' '}
            <code className="font-mono">OBSERVE_APP_SECRET</code> from its
            environment. Remove them to use this switch.
          </p>
        ) : (
          <Target status={status} />
        )}
        <RestartNotice status={status} />
        <FormError error={update.error} />
      </PanelBody>
    </Panel>
  );
}
