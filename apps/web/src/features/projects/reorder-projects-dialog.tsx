import { FormError } from '@/components/form';
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
import type { ProjectSummaryDto } from '@/lib/api/generated/api';
import { cn } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowDownUpIcon,
  ArrowUpIcon,
  GripVerticalIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ProjectAvatar } from './project-avatar';
import { moveItem } from './project-order';
import { reorderProjectsMutation } from './queries';

type Project = Pick<ProjectSummaryDto, 'id' | 'name' | 'slug'>;

/**
 * "Reorder" button + dialog: drag the rows (or use the arrows) to set the order of the
 * projects page, then save. New projects go last.
 */
export function ReorderProjectsDialog({
  projects,
}: {
  projects: readonly Project[];
}) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<readonly Project[]>(projects);
  const [dragging, setDragging] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...reorderProjectsMutation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects', 'list'] });
      toast.success('Projects reordered');
      setOpen(false);
    },
  });

  const move = (from: number, to: number) =>
    setOrder((current) => moveItem(current, from, to));
  const unchanged = order.every((project, i) => project.id === projects[i]?.id);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setOrder(projects);
        else mutation.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="xl">
          <ArrowDownUpIcon /> Reorder
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reorder projects</DialogTitle>
          <DialogDescription>
            Drag the projects, or use the arrows, into the order the projects
            page shows them. New projects go last.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex max-h-[60svh] flex-col gap-1.5 overflow-y-auto">
          {order.map((project, index) => (
            <li
              key={project.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                setDragging(index);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragging === null || dragging === index) return;
                move(dragging, index);
                setDragging(index);
              }}
              onDragEnd={() => setDragging(null)}
              className={cn(
                'flex items-center gap-3 rounded-lg border bg-card px-2 py-2',
                dragging === index && 'border-primary/50 opacity-70',
              )}
            >
              <GripVerticalIcon
                aria-hidden
                className="size-4 shrink-0 cursor-grab text-muted-foreground"
              />
              <ProjectAvatar name={project.name} className="size-8 text-xs" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {project.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${project.name} up`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${project.name} down`}
                disabled={index === order.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDownIcon />
              </Button>
            </li>
          ))}
        </ol>
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
            type="button"
            variant="inverse"
            size="lg"
            disabled={unchanged || mutation.isPending}
            onClick={() => mutation.mutate(order.map((project) => project.id))}
          >
            Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
