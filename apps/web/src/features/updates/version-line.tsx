import { useQuery } from '@tanstack/react-query';
import { ArrowUpRightIcon } from 'lucide-react';
import { updateStatusQueryOptions } from './queries';

/**
 * The running version, and a small link to the release page when a newer one is out.
 * Renders nothing until the status loads, and stays quiet when it can't.
 */
export function VersionLine() {
  const { data } = useQuery(updateStatusQueryOptions());
  if (!data) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 px-1 font-mono text-xs text-muted-foreground">
      <span>v{data.currentVersion.replace(/^v/, '')}</span>
      {data.updateAvailable && data.latestUrl ? (
        <a
          href={data.latestUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-primary hover:underline"
        >
          {data.latestVersion} available
          <ArrowUpRightIcon className="size-3" aria-hidden />
        </a>
      ) : null}
    </p>
  );
}
