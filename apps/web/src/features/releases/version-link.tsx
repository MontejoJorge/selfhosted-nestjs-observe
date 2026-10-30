import { ScopedLink } from '@/components/scoped-link';
import { paths } from '@/lib/paths';
import { useProjectRef } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { shortVersion } from './release-math';

/** A reported version, linking to the Releases page with that version marked. */
export function VersionLink({
  version,
  className,
}: {
  version: string | null;
  className?: string;
}) {
  const project = useProjectRef();
  if (!version) return <span className="text-muted-foreground">–</span>;
  return (
    <ScopedLink
      to={paths.releases(project)}
      search={{ version }}
      title={`${version}: see it on the Releases page`}
      className={cn('relative hover:underline', className)}
    >
      {shortVersion(version)}
    </ScopedLink>
  );
}
