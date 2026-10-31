import { FormError } from '@/components/form';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { Button } from '@/components/ui/button';
import {
  projectQueryOptions,
  updateProjectMutation,
} from '@/features/projects/queries';
import type { ProjectDto, TimeRange } from '@/lib/api/generated/api';
import {
  RANGE_PRESET_COUNT,
  TIME_RANGE_INFO,
  TIME_RANGES,
} from '@/lib/api/scope';
import { cn } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const sameSet = (a: readonly TimeRange[], b: readonly TimeRange[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

/** Picks the project's three quick ranges for its page headers. */
export function RangePresetsPanel({
  projectRef,
  project,
}: {
  /** The `:projectId` of the URL (slug or id), the key of the project query. */
  projectRef: string;
  project: ProjectDto;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<readonly TimeRange[]>(
    project.rangePresets,
  );
  const update = useMutation({
    ...updateProjectMutation(projectRef),
    onSuccess: async (next) => {
      queryClient.setQueryData(projectQueryOptions(projectRef).queryKey, next);
      setSelected(next.rangePresets);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Time ranges updated');
    },
  });

  const full = selected.length >= RANGE_PRESET_COUNT;
  const unchanged = sameSet(selected, project.rangePresets);
  const toggle = (value: TimeRange) =>
    setSelected((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : prev.length < RANGE_PRESET_COUNT
          ? [...prev, value]
          : prev,
    );

  return (
    <Panel>
      <PanelHeader title="Time ranges">
        <span className="font-mono text-xs text-muted-foreground">
          {selected.length}/{RANGE_PRESET_COUNT} selected
        </span>
      </PanelHeader>
      <PanelBody>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({
              // Shortest first, as the header shows them.
              rangePresets: TIME_RANGES.filter((value) =>
                selected.includes(value),
              ),
            });
          }}
        >
          <p className="max-w-xl text-sm text-muted-foreground">
            The quick ranges in every page header of this project. Pick{' '}
            {RANGE_PRESET_COUNT}; any other window is one click away in the
            custom range calendar.
          </p>
          <div
            role="group"
            aria-label="Quick ranges"
            className="flex flex-wrap gap-2"
          >
            {TIME_RANGES.map((value) => {
              const on = selected.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  title={TIME_RANGE_INFO[value].label}
                  disabled={!on && full}
                  onClick={() => toggle(value)}
                  className={cn(
                    'inline-flex h-9 min-w-16 items-center justify-center gap-1.5 rounded-md border px-3 font-mono text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                    on
                      ? 'border-foreground/30 bg-secondary text-foreground'
                      : 'border-dashed bg-card text-muted-foreground enabled:hover:text-foreground',
                  )}
                >
                  {on ? <CheckIcon className="size-3.5" aria-hidden /> : null}
                  {TIME_RANGE_INFO[value].short}
                </button>
              );
            })}
          </div>
          <FormError error={update.error} />
          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="submit"
              variant="inverse"
              size="lg"
              disabled={
                update.isPending ||
                selected.length !== RANGE_PRESET_COUNT ||
                unchanged
              }
            >
              Save time ranges
            </Button>
            {selected.length !== RANGE_PRESET_COUNT ? (
              <span className="text-xs text-muted-foreground">
                Select {RANGE_PRESET_COUNT - selected.length} more.
              </span>
            ) : null}
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}
