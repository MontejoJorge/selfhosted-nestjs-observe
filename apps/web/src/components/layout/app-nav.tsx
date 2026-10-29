import { ScopedLink } from '@/components/scoped-link';
import { projectQueryOptions } from '@/features/projects/queries';
import { paths } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIcon,
  AppWindowIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderOpenIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  SettingsIcon,
  SquareTerminalIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useMatch } from 'react-router';

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const itemBase =
  'flex h-9 items-center gap-3 rounded-lg border px-3 text-[13px] font-medium tracking-[0.03em] uppercase transition-colors';
const itemIdle =
  'border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground';
const itemActive =
  'border-primary/40 bg-linear-to-r from-primary/15 to-primary/5 text-primary';

function NavItem({
  to,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  to: string;
  label: string;
  icon?: LucideIcon;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ScopedLink
      to={to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        itemBase,
        !Icon && 'h-7 text-xs',
        active ? itemActive : itemIdle,
      )}
    >
      {Icon ? <Icon className="size-4 opacity-80" /> : null}
      {label}
    </ScopedLink>
  );
}

/** An Activity entry that is planned but not built yet: not a link, with a "Soon" badge. */
function SoonItem({ label }: { label: string }) {
  return (
    <span
      aria-disabled
      className={cn(
        itemBase,
        'h-7 cursor-default border-transparent text-xs text-sidebar-foreground/50',
      )}
    >
      {label}
      <span className="ml-auto rounded-sm border border-sidebar-border px-1.5 py-px font-mono text-[9px] tracking-wider text-muted-foreground">
        Soon
      </span>
    </span>
  );
}

function Breadcrumb({ project }: { project?: string }) {
  return (
    <div className="mb-3 flex h-5 min-w-0 items-center gap-1 px-1 font-mono text-[11px] tracking-wider uppercase">
      <Link
        to={paths.projects}
        className={cn(
          project ? 'text-primary hover:underline' : 'text-muted-foreground',
        )}
      >
        Dashboard
      </Link>
      {project ? (
        <>
          <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-foreground">{project}</span>
        </>
      ) : null}
    </div>
  );
}

function RootNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1.5">
      <Breadcrumb />
      <NavItem
        to={paths.projects}
        label="Projects"
        icon={FolderOpenIcon}
        active={isUnder(pathname, paths.projects)}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

function ProjectNav({
  project,
  onNavigate,
}: {
  project: string;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  // Non-suspending: the layout loader already warmed it, and the nav must never block.
  const { data } = useQuery(projectQueryOptions(project));
  const [activityOpen, setActivityOpen] = useState(true);

  const activity = [
    {
      to: paths.requests(project),
      label: 'Requests',
      prefixes: [paths.requests(project), `${paths.project(project)}/traces`],
    },
    {
      to: paths.profiler(project),
      label: 'Profiler',
      prefixes: [paths.profiler(project)],
    },
    { to: paths.jobs(project), label: 'Jobs', prefixes: [paths.jobs(project)] },
    {
      to: paths.errors(project),
      label: 'Errors',
      prefixes: [paths.errors(project)],
    },
    {
      to: paths.users(project),
      label: 'Users',
      prefixes: [paths.users(project)],
    },
    { label: 'Custom', soon: true },
    {
      to: paths.services(project),
      label: 'Services',
      prefixes: [paths.services(project)],
    },
    { label: 'Releases', soon: true },
  ] as const;
  const activityActive = activity.some(
    (item) =>
      'prefixes' in item &&
      item.prefixes.some((prefix) => isUnder(pathname, prefix)),
  );

  return (
    <nav aria-label="Project" className="flex flex-col gap-1.5">
      <Breadcrumb project={data?.name ?? 'Project'} />
      <NavItem
        to={paths.project(project)}
        label="Dashboard"
        icon={LayoutGridIcon}
        active={pathname === paths.project(project)}
        onNavigate={onNavigate}
      />
      <NavItem
        to={paths.applications(project)}
        label="Applications"
        icon={AppWindowIcon}
        active={isUnder(pathname, paths.applications(project))}
        onNavigate={onNavigate}
      />
      <button
        type="button"
        onClick={() => setActivityOpen((open) => !open)}
        aria-expanded={activityOpen}
        className={cn(
          itemBase,
          itemIdle,
          activityActive && !activityOpen && 'text-primary',
        )}
      >
        <ActivityIcon className="size-4 opacity-80" />
        Activity
        <ChevronDownIcon
          className={cn(
            'ml-auto size-4 opacity-60 transition-transform',
            !activityOpen && '-rotate-90',
          )}
        />
      </button>
      {activityOpen ? (
        <div className="ml-[19px] flex flex-col gap-1 border-l border-sidebar-border py-0.5 pl-3">
          {activity.map((item) =>
            'soon' in item ? (
              <SoonItem key={item.label} label={item.label} />
            ) : (
              <NavItem
                key={item.to}
                to={item.to}
                label={item.label}
                active={item.prefixes.some((prefix) =>
                  isUnder(pathname, prefix),
                )}
                onNavigate={onNavigate}
              />
            ),
          )}
        </div>
      ) : null}
      <NavItem
        to={paths.logs(project)}
        label="Logs"
        icon={SquareTerminalIcon}
        active={isUnder(pathname, paths.logs(project))}
        onNavigate={onNavigate}
      />
      <NavItem
        to={paths.keys(project)}
        label="API keys"
        icon={KeyRoundIcon}
        active={isUnder(pathname, paths.keys(project))}
        onNavigate={onNavigate}
      />
      <NavItem
        to={paths.settings(project)}
        label="Settings"
        icon={SettingsIcon}
        active={isUnder(pathname, paths.settings(project))}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

/** Breadcrumb + navigation, shared by the desktop sidebar and the mobile sheet. */
export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const projectId = useMatch('/projects/:projectId/*')?.params.projectId;
  return projectId ? (
    <ProjectNav project={projectId} onNavigate={onNavigate} />
  ) : (
    <RootNav onNavigate={onNavigate} />
  );
}
