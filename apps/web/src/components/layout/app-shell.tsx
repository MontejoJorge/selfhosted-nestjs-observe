import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import { Outlet } from '@tanstack/react-router';
import { AppSidebar } from './app-sidebar';
import { RangeSelect, RefreshButton, ServiceSelect } from './scope-controls';

export function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <ServiceSelect />
          <div className="ml-auto flex items-center gap-1">
            <RangeSelect />
            <RefreshButton />
            <ThemeToggle />
          </div>
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
