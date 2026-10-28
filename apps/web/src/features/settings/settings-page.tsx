import { ConfirmDialog } from '@/components/confirm-dialog';
import { KeyValue, KeyValueList } from '@/components/data/key-value';
import { Field, FormError } from '@/components/form';
import { Page, PageHeader } from '@/components/page';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ProjectTitle } from '@/features/projects/project-title';
import {
  deleteProjectMutation,
  projectQueryOptions,
  updateProjectMutation,
} from '@/features/projects/queries';
import { paths } from '@/lib/paths';
import { useProjectRef } from '@/lib/scope-hooks';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export function SettingsPage() {
  const ref = useProjectRef();
  const { data: project } = useSuspenseQuery(projectQueryOptions(ref));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  const update = useMutation({
    ...updateProjectMutation(ref),
    onSuccess: async (next) => {
      queryClient.setQueryData(projectQueryOptions(ref).queryKey, next);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project updated');
    },
  });
  const remove = useMutation({
    ...deleteProjectMutation(ref),
    onSuccess: async () => {
      // Drop the cached list so the projects page loads it fresh, leave,
      // then forget the deleted project (nothing renders it any more).
      queryClient.removeQueries({ queryKey: ['projects', 'list'] });
      await navigate(paths.projects);
      queryClient.removeQueries({ queryKey: ['projects', 'detail', ref] });
      toast.success(`Project “${project.name}” deleted`);
    },
  });

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Manage your project's name, description and lifecycle.">
          Settings
        </ProjectTitle>
      </PageHeader>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="General" />
          <PanelBody>
            <form
              key={`${project.name}:${project.description ?? ''}`}
              className="flex max-w-xl flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const description = String(
                  form.get('description') ?? '',
                ).trim();
                update.mutate({
                  name: String(form.get('name') ?? '').trim(),
                  description: description || null,
                });
              }}
            >
              <Field label="Name" htmlFor="settings-name">
                <Input
                  id="settings-name"
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={project.name}
                />
              </Field>
              <Field label="Description" htmlFor="settings-description">
                <Textarea
                  id="settings-description"
                  name="description"
                  maxLength={500}
                  rows={3}
                  defaultValue={project.description ?? ''}
                />
              </Field>
              <FormError error={update.error} />
              <div>
                <Button
                  type="submit"
                  variant="inverse"
                  size="lg"
                  disabled={update.isPending}
                >
                  Save changes
                </Button>
              </div>
            </form>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Project" />
          <PanelBody>
            <KeyValueList>
              <KeyValue label="Slug">{project.slug}</KeyValue>
              <KeyValue label="ID">{project.id}</KeyValue>
              <KeyValue label="Applications">
                {project.applicationCount}
              </KeyValue>
              <KeyValue label="Created">
                {dateFormat.format(new Date(project.createdAt))}
              </KeyValue>
            </KeyValueList>
            <p className="mt-3 text-xs text-muted-foreground">
              The slug is used in dashboard URLs and doesn't change on rename.
            </p>
          </PanelBody>
        </Panel>
      </div>

      <Panel className="border-primary/40">
        <PanelHeader
          title={<span className="text-primary">Danger zone</span>}
        />
        <PanelBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl text-sm">
            <p className="font-medium">Delete this project</p>
            <p className="text-muted-foreground">
              Deletes its applications and API keys, and purges all of its
              telemetry. Agents of its applications start getting 401.
            </p>
          </div>
          <Button
            variant="destructive"
            size="lg"
            onClick={() => {
              setTyped('');
              remove.reset();
              setConfirming(true);
            }}
          >
            Delete project
          </Button>
        </PanelBody>
      </Panel>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${project.name}?`}
        confirmLabel="Delete project"
        pending={remove.isPending || typed !== project.name}
        error={remove.error}
        onConfirm={() => remove.mutate()}
      >
        <p>
          This deletes {project.applicationCount}{' '}
          {project.applicationCount === 1 ? 'application' : 'applications'},
          their API keys and all telemetry. It can't be undone.
        </p>
        <label className="mt-2 flex flex-col gap-2 text-foreground">
          <span className="text-sm">
            Type <strong className="font-mono">{project.name}</strong> to
            confirm.
          </span>
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-label="Project name"
            autoComplete="off"
          />
        </label>
      </ConfirmDialog>
    </Page>
  );
}
