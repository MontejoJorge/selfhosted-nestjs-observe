import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { API_URL } from '@/lib/api/client';
import { Link, useLocation } from '@tanstack/react-router';
import {
  ActivityIcon,
  BugIcon,
  CpuIcon,
  GaugeIcon,
  LayersIcon,
  ScrollTextIcon,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  to: '/' | '/requests' | '/jobs' | '/errors' | '/logs' | '/metrics';
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: GaugeIcon },
  { to: '/requests', label: 'Requests', icon: ActivityIcon },
  { to: '/jobs', label: 'Jobs', icon: LayersIcon },
  { to: '/errors', label: 'Errors', icon: BugIcon },
  { to: '/logs', label: 'Logs', icon: ScrollTextIcon },
  { to: '/metrics', label: 'Metrics', icon: CpuIcon },
];

function isActive(pathname: string, to: NavItem['to']): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppSidebar() {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <ActivityIcon className="size-4" />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="font-semibold">Observe</span>
                  <span className="text-xs text-muted-foreground">
                    self-hosted
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(pathname, item.to)}
                    tooltip={item.label}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <p
          className="truncate px-2 font-mono text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden"
          title={`Collector: ${API_URL}`}
        >
          {API_URL}
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
