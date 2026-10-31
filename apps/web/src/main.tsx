import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/features/theme/theme-provider';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './index.css';

/** In demo builds, starts the mock API before anything fetches and returns its banner. */
async function prepareDemo(): Promise<ComponentType | null> {
  if (import.meta.env.VITE_DEMO !== 'true') return null;
  const demo = await import('./demo');
  await demo.startDemo();
  return demo.DemoBanner;
}

const DemoBanner = await prepareDemo();
// The router starts loading as soon as it is created: import it after the mock API is up.
const { queryClient, router } = await import('./router');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" />
          {DemoBanner ? <DemoBanner /> : null}
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
