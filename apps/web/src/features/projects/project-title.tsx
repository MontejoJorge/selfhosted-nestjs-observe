import { PageTitle } from '@/components/page';
import { useProjectRef } from '@/lib/scope-hooks';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ProjectAvatar } from './project-avatar';
import { projectQueryOptions } from './queries';

/** PageTitle for project pages: the project monogram, a bold title and a mono subtitle. */
export function ProjectTitle({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
}) {
  const { data: project } = useSuspenseQuery(
    projectQueryOptions(useProjectRef()),
  );
  return (
    <PageTitle
      avatar={<ProjectAvatar name={project.name} />}
      subtitle={subtitle}
    >
      {children}
    </PageTitle>
  );
}
