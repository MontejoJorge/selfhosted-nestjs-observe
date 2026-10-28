import { paths } from '@/lib/paths';
import { useScopedNavigate } from '@/lib/scope-hooks';
import { SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useMatch } from 'react-router';

const TRACE_ID = /^[0-9a-f]{16,64}$/i;

/**
 * Top-bar search: a trace id opens the trace view, anything else searches
 * the logs. Submitting with Enter navigates; it never fetches on its own.
 */
export function GlobalSearch() {
  const navigate = useScopedNavigate();
  const [value, setValue] = useState('');
  const project = useMatch('/projects/:projectId/*')?.params.projectId;
  // Logs and traces live in a project: outside one there is nothing to search.
  if (!project) return <div className="h-9" />;

  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        if (!query) return;
        if (TRACE_ID.test(query)) navigate(paths.trace(project, query));
        else navigate(paths.logs(project), { q: query });
        setValue('');
      }}
    >
      <SearchIcon className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search logs or paste a trace id"
        aria-label="Search logs or open a trace"
        className="h-9 w-full bg-transparent pl-7 text-sm placeholder:text-muted-foreground focus:outline-none"
      />
    </form>
  );
}
