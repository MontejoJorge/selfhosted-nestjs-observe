import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ServiceDto } from '@/lib/api/generated/api';
import { formatCount, formatDuration, formatShare } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useProjectRef } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import { avgOwnMs } from './search';
import { squarify } from './treemap';

const TOP = 10;
/** Layout box; the map keeps this aspect ratio. */
const WIDTH = 100;
const HEIGHT = 110;

/** Lets long class names wrap between words: `ProductsRepository` → `Products|Repository`. */
const wrappable = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1​$2');

/**
 * "Where the time goes" on the dashboard: the top classes by own time as a treemap,
 * each linking to Services filtered to it, and a strip for the rest.
 */
export function TimeMapPanel({
  services,
  totalSelfMs,
}: {
  services: readonly ServiceDto[];
  totalSelfMs: number;
}) {
  const project = useProjectRef();
  const top = services.slice(0, TOP);
  const rest = services.slice(TOP);
  const topShare = top.reduce((sum, service) => sum + service.share, 0);
  const restShare = rest.reduce((sum, service) => sum + service.share, 0);
  const rects = useMemo(
    () =>
      squarify(
        services.slice(0, TOP).map((service) => service.selfMs),
        { x: 0, y: 0, w: WIDTH, h: HEIGHT },
      ),
    [services],
  );

  return (
    <Panel>
      <PanelHeader
        title="Where the time goes"
        aside={<span className="text-[13px] font-medium">OWN TIME</span>}
      />
      <PanelBody className="flex flex-1 flex-col gap-5">
        {top.length === 0 || totalSelfMs <= 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No spans in this time range.
          </p>
        ) : (
          <>
            <div title="Own time is the time spent in a class's own code, with the calls it waits on left out: where the time actually goes.">
              <p className="flex items-baseline gap-1.5">
                <span className="text-3xl font-medium tabular-nums">
                  {formatShare(topShare)}
                  <span className="text-lg text-muted-foreground">%</span>
                </span>
                <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  of own time
                </span>
              </p>
              <p className="mt-1 font-mono text-[13px]">
                in the top {top.length} {top.length === 1 ? 'class' : 'classes'}
              </p>
            </div>
            <ul
              aria-label={`Own time by class: the top ${top.length} hold ${formatShare(topShare)}%`}
              className="relative w-full"
              style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
            >
              {top.map((service, index) => (
                <Tile
                  key={service.className}
                  service={service}
                  heaviest={index === 0}
                  rect={rects[index]}
                  to={paths.services(project)}
                />
              ))}
            </ul>
            {rest.length > 0 ? (
              <ScopedLink
                to={paths.services(project)}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/20 font-mono text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                aria-label={`${rest.length} more classes: ${formatShare(restShare)}% of all own time`}
              >
                {rest.length} more
                <span className="font-semibold text-foreground">
                  {formatShare(restShare)}%
                </span>
              </ScopedLink>
            ) : null}
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

function Tile({
  service,
  heaviest,
  rect,
  to,
}: {
  service: ServiceDto;
  heaviest: boolean;
  rect: { x: number; y: number; w: number; h: number };
  to: string;
}) {
  const showName = rect.w >= 20 && rect.h >= 18;
  const showShare = rect.w >= 10 && rect.h >= 10;
  const big = rect.w >= 30 && rect.h >= 30;
  const label = `${service.className}: ${formatDuration(service.selfMs)} of own time, ${formatShare(service.share)}% of all · ${formatCount(service.calls)} calls at ${formatDuration(avgOwnMs(service))} each · ${formatCount(service.errorCount)} failed`;
  return (
    <li
      className="absolute p-[3px]"
      style={{
        left: `${(rect.x / WIDTH) * 100}%`,
        top: `${(rect.y / HEIGHT) * 100}%`,
        width: `${(rect.w / WIDTH) * 100}%`,
        height: `${(rect.h / HEIGHT) * 100}%`,
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <ScopedLink
            to={to}
            search={{ className: service.className }}
            aria-label={label}
            className={cn(
              'flex size-full flex-col justify-between overflow-hidden rounded-lg border p-2.5 transition-colors',
              heaviest
                ? 'border-primary/70 bg-primary/15 hover:bg-primary/25'
                : 'border-foreground/10 bg-foreground/[0.02] hover:border-foreground/30 hover:bg-foreground/[0.05]',
            )}
          >
            {showName ? (
              <span
                className={cn(
                  'line-clamp-2 font-mono text-xs break-words',
                  heaviest
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {wrappable(service.className)}
              </span>
            ) : (
              <span />
            )}
            {showShare ? (
              <span
                className={cn(
                  'flex items-baseline gap-1.5 tabular-nums',
                  !showName && 'self-center',
                )}
              >
                <span
                  className={cn(
                    big
                      ? 'text-2xl text-muted-foreground'
                      : 'font-mono text-[11px] font-semibold',
                  )}
                >
                  {formatShare(service.share)}
                  <span className={cn(big && 'text-base')}>%</span>
                </span>
                {big && heaviest ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatDuration(service.selfMs)}
                  </span>
                ) : null}
              </span>
            ) : null}
          </ScopedLink>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="flex-col items-start gap-1 border bg-popover px-3 py-2.5 font-mono text-[11px] text-popover-foreground [&_svg]:hidden"
        >
          <span className="flex items-center gap-1.5 tracking-wider text-muted-foreground uppercase">
            <span className="size-2 rounded-[2px] bg-primary" aria-hidden />
            {heaviest ? 'Heaviest class' : 'Class'}
          </span>
          <span className="font-semibold">{service.className}</span>
          <span>
            <span className="font-semibold">
              {formatDuration(service.selfMs)}
            </span>{' '}
            own time · {formatShare(service.share)}% of all
          </span>
          <span>
            {formatCount(service.calls)} calls at{' '}
            {formatDuration(avgOwnMs(service))} each
          </span>
          {service.errorCount > 0 ? (
            <span className="text-primary">
              {formatCount(service.errorCount)} failed
            </span>
          ) : null}
          <span className="mt-1 w-full border-t pt-1.5 text-muted-foreground">
            Click to open it in Services
          </span>
        </TooltipContent>
      </Tooltip>
    </li>
  );
}
