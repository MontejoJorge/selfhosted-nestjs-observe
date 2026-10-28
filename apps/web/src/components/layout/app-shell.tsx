import { PageSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { LiveProvider } from '@/features/live/live-provider';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import { API_URL } from '@/lib/api/client';
import { paths } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { FoldersIcon, MenuIcon } from 'lucide-react';
import { Suspense, useState } from 'react';
import {
  Link,
  Outlet,
  ScrollRestoration,
  useMatch,
  useNavigation,
} from 'react-router';
import { AppNav } from './app-nav';
import { GlobalSearch } from './global-search';
import { LogoMark } from './logo-mark';

/** Narrow far-left rail: the mark, the projects shortcut and the theme toggle. */
function Rail() {
  const atProjects = useMatch('/projects/*') !== null;
  return (
    <div className="sticky top-0 hidden h-svh w-[60px] shrink-0 flex-col items-center gap-6 border-r border-sidebar-border bg-rail py-5 lg:flex">
      <Link to={paths.projects} aria-label="All projects">
        <LogoMark />
      </Link>
      <div className="flex flex-col gap-1 rounded-xl border border-sidebar-border p-1">
        <Link
          to={paths.projects}
          aria-label="Projects"
          title="Projects"
          className={cn(
            'grid size-9 place-items-center rounded-lg text-sidebar-foreground transition-colors hover:text-foreground',
            atProjects && 'bg-sidebar-accent text-foreground',
          )}
        >
          <FoldersIcon className="size-4" />
        </Link>
      </div>
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-[270px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex">
      <AppNav />
      <div className="mt-auto border-t border-sidebar-border pt-4">
        <p className="px-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          Collector
        </p>
        <p
          className="truncate px-1 font-mono text-xs text-sidebar-foreground"
          title={API_URL}
        >
          {API_URL}
        </p>
      </div>
    </aside>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] bg-sidebar p-5">
        <SheetTitle className="flex items-center gap-2">
          <LogoMark className="size-6" /> Navigation
        </SheetTitle>
        <AppNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function AppShell() {
  const navigation = useNavigation();
  const isNavigating = navigation.state !== 'idle';

  return (
    <LiveProvider>
      <ScrollRestoration />
      <div className="flex min-h-svh">
        <Rail />
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative flex h-[72px] shrink-0 items-center gap-3 px-4 md:px-8 lg:px-[60px]">
            <MobileNav />
            <GlobalSearch />
            <div className="ml-auto lg:hidden">
              <ThemeToggle />
            </div>
            {/* Pending UI while a navigation's loaders run. */}
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 h-0.5 origin-left bg-primary transition-[opacity,transform] duration-500',
                isNavigating ? 'scale-x-75 opacity-100' : 'scale-x-0 opacity-0',
              )}
            />
          </header>
          <main
            aria-busy={isNavigating}
            className={cn(
              'min-w-0 flex-1 transition-opacity',
              isNavigating && 'opacity-60 delay-300',
            )}
          >
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </LiveProvider>
  );
}
