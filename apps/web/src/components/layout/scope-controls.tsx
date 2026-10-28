import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { servicesQueryOptions } from '@/features/services/queries';
import { TIME_RANGE_LABELS, TIME_RANGES } from '@/lib/api/scope';
import { useScope } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import type { TimeRange } from '@selfhosted-observe/contracts';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { RefreshCwIcon } from 'lucide-react';

const ALL_SERVICES = '__all__';

export function ServiceSelect() {
  const { service } = useScope();
  const navigate = useNavigate();
  const services = useQuery(servicesQueryOptions());

  const options = services.data ?? [];
  // Keep a service from the URL selectable even before the list has loaded.
  const showUrlService =
    service !== undefined && !options.some((s) => s.serviceId === service);

  return (
    <Select
      value={service ?? ALL_SERVICES}
      onValueChange={(value) =>
        navigate({
          to: '.',
          search: (prev) => ({
            ...prev,
            service: value === ALL_SERVICES ? undefined : value,
          }),
        })
      }
    >
      <SelectTrigger size="sm" className="w-52" aria-label="Service">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_SERVICES}>All services</SelectItem>
        {showUrlService ? (
          <SelectItem value={service}>{service}</SelectItem>
        ) : null}
        {options.map((s) => (
          <SelectItem key={s.serviceId} value={s.serviceId}>
            <span className="truncate">{s.serviceId}</span>
            {s.serviceVersion ? (
              <span className="text-xs text-muted-foreground">
                {s.serviceVersion}
              </span>
            ) : null}
          </SelectItem>
        ))}
        {services.isError ? (
          <div className="px-2 py-1.5 text-xs text-destructive">
            Could not load services
          </div>
        ) : null}
      </SelectContent>
    </Select>
  );
}

export function RangeSelect() {
  const { range } = useScope();
  const navigate = useNavigate();

  return (
    <Select
      value={range}
      onValueChange={(value) =>
        navigate({
          to: '.',
          search: (prev) => ({ ...prev, range: value as TimeRange }),
        })
      }
    >
      <SelectTrigger size="sm" className="w-40" aria-label="Time range">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {TIME_RANGES.map((value) => (
          <SelectItem key={value} value={value}>
            {TIME_RANGE_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RefreshButton() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const fetching = useIsFetching() > 0;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Refresh data"
      title="Refresh data"
      onClick={() => {
        void queryClient.invalidateQueries();
        void router.invalidate();
      }}
    >
      <RefreshCwIcon className={cn(fetching && 'animate-spin')} />
    </Button>
  );
}
