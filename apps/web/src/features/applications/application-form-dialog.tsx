import { TagChip } from '@/components/data/badges';
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
import { XIcon } from 'lucide-react';
import { useState } from 'react';

export const MAX_TAGS = 3;
const MAX_TAG_LENGTH = 30;

export interface ApplicationFormValues {
  name: string;
  tags: string[];
}

/** Up to three short tags: type and press Enter (or comma) to add one. */
function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const full = tags.length >= MAX_TAGS;
  const add = () => {
    const tag = draft.trim().slice(0, MAX_TAG_LENGTH);
    if (tag && !full && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-2">
      <Input
        id="application-tags"
        value={draft}
        disabled={full}
        maxLength={MAX_TAG_LENGTH}
        placeholder={full ? 'Maximum of 3 tags' : 'e.g. production'}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={add}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            add();
          }
        }}
      />
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <TagChip>
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => onChange(tags.filter((t) => t !== tag))}
                  className="-mr-1 ml-1 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              </TagChip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Edit dialog for an application: name + up to three tags. */
export function ApplicationFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initial,
  pending,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  initial: ApplicationFormValues;
  pending: boolean;
  error: unknown;
  onSubmit: (values: ApplicationFormValues) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed by `open` so each opening starts from `initial`. */}
        {open ? (
          <ApplicationForm
            title={title}
            description={description}
            submitLabel={submitLabel}
            initial={initial}
            pending={pending}
            error={error}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The application form (name + tags) for a dialog body. */
export function ApplicationForm({
  title,
  description,
  submitLabel,
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  initial: ApplicationFormValues;
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onSubmit: (values: ApplicationFormValues) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [tags, setTags] = useState(initial.tags);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name: name.trim(), tags });
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field label="Name" htmlFor="application-name">
        <Input
          id="application-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={100}
          autoFocus
          placeholder="orders-api"
        />
      </Field>
      <Field
        label="Tags"
        htmlFor="application-tags"
        hint="Up to 3 tags. Press Enter to add one."
      >
        <TagInput tags={tags} onChange={setTags} />
      </Field>
      <FormError error={error} />
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="inverse" size="lg" disabled={pending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
