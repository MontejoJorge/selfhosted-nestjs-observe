import { ScopedLink } from './scoped-link';
import { EmptyState } from './states';
import { Button } from './ui/button';

export function NotFound() {
  return (
    <div className="p-4 md:p-6">
      <EmptyState title="Page not found">
        <Button asChild variant="outline" size="sm" className="mt-2">
          <ScopedLink to="/">Back to overview</ScopedLink>
        </Button>
      </EmptyState>
    </div>
  );
}
