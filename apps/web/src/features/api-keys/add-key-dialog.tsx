import { Field, FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ApplicationSummaryDto,
  CreatedApiKeyDto,
} from '@/lib/api/generated/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiKeyCredentials } from './api-key-credentials';
import { createApiKeyMutation } from './queries';

function KeyForm({
  project,
  applications,
  onCreated,
  onCancel,
}: {
  project: string;
  applications: readonly ApplicationSummaryDto[];
  onCreated: (key: CreatedApiKeyDto) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [applicationId, setApplicationId] = useState(
    applications.length === 1 ? applications[0].id : '',
  );
  const mutation = useMutation({
    ...createApiKeyMutation(project),
    onSuccess: async (key) => {
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      onCreated(key);
    },
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        mutation.mutate({
          name: String(form.get('name') ?? '').trim(),
          applicationId,
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Add key</DialogTitle>
        <DialogDescription>
          An API key lets an application's agent send telemetry to this
          collector.
        </DialogDescription>
      </DialogHeader>
      <Field label="Name" htmlFor="key-name">
        <Input
          id="key-name"
          name="name"
          required
          maxLength={100}
          autoFocus
          placeholder="orders-api production"
        />
      </Field>
      <Field label="Application" htmlFor="key-application">
        <Select value={applicationId} onValueChange={setApplicationId}>
          <SelectTrigger id="key-application" className="w-full">
            <SelectValue placeholder="Select an application" />
          </SelectTrigger>
          <SelectContent>
            {applications.map((app) => (
              <SelectItem key={app.id} value={app.id}>
                {app.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <FormError error={mutation.error} />
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="inverse"
          size="lg"
          disabled={mutation.isPending || !applicationId}
        >
          Create key
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Shown once after creation: the only time the secret is visible. */
function CreatedKey({
  apiKey,
  onDone,
}: {
  apiKey: CreatedApiKeyDto;
  onDone: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Key created for {apiKey.applicationName}</DialogTitle>
        <DialogDescription>
          Configure the agent of {apiKey.applicationName} with these values.
        </DialogDescription>
      </DialogHeader>
      <ApiKeyCredentials keyId={apiKey.keyId} secret={apiKey.secret} />
      <DialogFooter>
        <Button variant="inverse" size="lg" onClick={onDone}>
          I've saved the secret
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * The "Add key" dialog: the form, then the one-time credentials. Closing it
 * from the credentials step forgets the secret.
 */
export function AddKeyDialog({
  open,
  onOpenChange,
  project,
  applications,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  applications: readonly ApplicationSummaryDto[];
}) {
  const [created, setCreated] = useState<CreatedApiKeyDto | null>(null);
  const close = () => {
    onOpenChange(false);
    setCreated(null);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent
        className="sm:max-w-lg"
        // Don't lose the secret to a stray click outside.
        onInteractOutside={(event) => created && event.preventDefault()}
      >
        {created ? (
          <CreatedKey apiKey={created} onDone={close} />
        ) : open ? (
          <KeyForm
            project={project}
            applications={applications}
            onCreated={setCreated}
            onCancel={close}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
