import { PageSkeleton } from '@/components/states';
import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import { cn } from '@/lib/utils';
import { Suspense } from 'react';
import { Outlet, useNavigation } from 'react-router';
import { AppSidebar } from './app-sidebar';
import { RangeSelect, RefreshButton, ServiceSelect } from './scope-controls';

export function AppShell() {
  const navigation = useNavigation();
  const isNavigating = navigation.state !== 'idle';

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="mx-1 hidden h-5 sm:block"
          />
          <ServiceSelect />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <RangeSelect />
            <RefreshButton />
            <ThemeToggle />
          </div>
          {/* Pending UI while a navigation's loaders run. */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary transition-[opacity,transform] duration-500',
              isNavigating ? 'scale-x-75 opacity-100' : 'scale-x-0 opacity-0',
            )}
          />
        </header>
        <div
          aria-busy={isNavigating}
          className={cn(
            'min-w-0 transition-opacity',
            isNavigating && 'opacity-60 delay-300',
          )}
        >
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
