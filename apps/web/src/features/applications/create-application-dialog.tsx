import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiKeyCredentials } from '@/features/api-keys/api-key-credentials';
import type { CreatedApplicationDto } from '@/lib/api/generated/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApplicationForm } from './application-form-dialog';
import { createApplicationMutation } from './queries';

/** Shown once after creation: the app's first API key, the only time its secret is visible. */
function CreatedApplication({
  application,
  onDone,
}: {
  application: CreatedApplicationDto;
  onDone: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Application “{application.name}” created</DialogTitle>
        <DialogDescription>
          Its first API key is ready. Configure the agent of {application.name}{' '}
          with these values.
        </DialogDescription>
      </DialogHeader>
      <ApiKeyCredentials
        appKey={application.apiKey.appKey}
        appSecret={application.apiKey.appSecret}
      />
      <DialogFooter>
        <Button variant="inverse" size="lg" onClick={onDone}>
          I've saved the app secret
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * The "Create application" dialog: the form, then the credentials of the API
 * key created with it. Closing it from the credentials step forgets the secret.
 */
export function CreateApplicationDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
}) {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<CreatedApplicationDto | null>(null);
  const mutation = useMutation({
    ...createApplicationMutation(project),
    onSuccess: async (application) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
      ]);
      toast.success(`Application “${application.name}” created`);
      setCreated(application);
    },
  });
  const close = () => {
    onOpenChange(false);
    setCreated(null);
    mutation.reset();
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
          <CreatedApplication application={created} onDone={close} />
        ) : open ? (
          <ApplicationForm
            title="Create application"
            description="An application is one Nest service. It gets an API key for its agent, shown once after you create it."
            submitLabel="Create application"
            initial={{ name: '', tags: [] }}
            pending={mutation.isPending}
            error={mutation.error}
            onCancel={close}
            onSubmit={(values) => mutation.mutate(values)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
