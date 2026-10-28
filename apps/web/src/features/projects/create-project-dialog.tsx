import { Field, FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { paths } from '@/lib/paths';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { createProjectMutation } from './queries';

/** "Create project" button + dialog; opens the new project's dashboard on success. */
export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    ...createProjectMutation(),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(`Project “${project.name}” created`);
      setOpen(false);
      navigate(paths.project(project.slug));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="inverse" size="xl">
          <PlusIcon /> Create project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const description = String(form.get('description') ?? '').trim();
            mutation.mutate({
              name: String(form.get('name') ?? '').trim(),
              description: description || null,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              A project groups the applications of one product. Its URL is
              derived from the name and doesn't change.
            </DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor="project-name">
            <Input
              id="project-name"
              name="name"
              required
              maxLength={100}
              autoFocus
              placeholder="Demo Shop"
            />
          </Field>
          <Field label="Description" htmlFor="project-description">
            <Textarea
              id="project-description"
              name="description"
              maxLength={500}
              rows={3}
              placeholder="Optional"
            />
          </Field>
          <FormError error={mutation.error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="inverse"
              size="lg"
              disabled={mutation.isPending}
            >
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
