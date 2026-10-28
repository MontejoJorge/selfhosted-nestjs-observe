import { Link } from '@tanstack/react-router';
import { EmptyState } from './states';
import { Button } from './ui/button';

export function NotFound() {
  return (
    <div className="p-4 md:p-6">
      <EmptyState title="Page not found">
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link to="/">Back to overview</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
