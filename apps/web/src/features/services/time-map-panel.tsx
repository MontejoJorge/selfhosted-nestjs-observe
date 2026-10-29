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
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { avgOwnMs } from './search';
import { fitTreemap, type Rect } from './treemap';

const MAX_TILES = 10;
/** Space between tiles (px). */
const GAP = 6;
/** Smallest tile side (px); classes that would get less go to "Others". */
const MIN_SIDE = 28;
/** Height of the map against its width. */
const ASPECT = 1.1;

/** Lets long class names wrap between words: `ProductsRepository` → `Products|Repository`. */
const wrappable = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1​$2');

/** Width of an element, kept up to date as it resizes; 0 before the first layout. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * "Where the time goes" on the dashboard: the top classes by own time as a treemap,
 * each linking to Services filtered to it, and an "Others" row with the sum of the
 * classes that do not get a readable tile.
 */
export function TimeMapPanel({
  services,
  totalSelfMs,
}: {
  services: readonly ServiceDto[];
  totalSelfMs: number;
}) {
  const project = useProjectRef();
  const [mapRef, width] = useWidth<HTMLUListElement>();
  const height = Math.round(width * ASPECT);
  const rects = useMemo(
    () =>
      width > 0
        ? fitTreemap(
            services.map((service) => service.selfMs),
            { x: 0, y: 0, w: width, h: height },
            { max: MAX_TILES, minSide: MIN_SIDE, gap: GAP },
          )
        : [],
    [services, width, height],
  );
  const tiles = services.slice(0, Math.max(rects.length, 1));
  const others = services.slice(tiles.length);
  const tilesShare = tiles.reduce((sum, service) => sum + service.share, 0);

  return (
    <Panel>
      <PanelHeader
        title="Where the time goes"
        aside={<span className="text-[13px] font-medium">OWN TIME</span>}
      />
      <PanelBody className="flex flex-1 flex-col gap-5">
        {services.length === 0 || totalSelfMs <= 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No spans in this time range.
          </p>
        ) : (
          <>
            <div title="Own time is the time spent in a class's own code, with the calls it waits on left out: where the time actually goes.">
              <p className="flex items-baseline gap-1.5">
                <span className="text-3xl font-medium tabular-nums">
                  {formatShare(tilesShare)}
                  <span className="text-lg text-muted-foreground">%</span>
                </span>
                <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  of own time
                </span>
              </p>
              <p className="mt-1 font-mono text-[13px]">
                in the top {tiles.length}{' '}
                {tiles.length === 1 ? 'class' : 'classes'}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <ul
                ref={mapRef}
                aria-label={`Own time by class: the top ${tiles.length} hold ${formatShare(tilesShare)}%`}
                className="relative w-full overflow-hidden"
                style={{ height }}
              >
                {rects.map((rect, index) => (
                  <li
                    key={tiles[index].className}
                    className="absolute"
                    style={{
                      left: rect.x + GAP / 2,
                      top: rect.y + GAP / 2,
                      width: rect.w - GAP,
                      height: rect.h - GAP,
                    }}
                  >
                    <Tile
                      service={tiles[index]}
                      heaviest={index === 0}
                      rect={rect}
                      to={paths.services(project)}
                    />
                  </li>
                ))}
              </ul>
              {others.length > 0 ? (
                <Others services={others} to={paths.services(project)} />
              ) : null}
            </div>
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
  rect: Rect;
  to: string;
}) {
  const showName = rect.w >= 76 && rect.h >= 50;
  const showShare = rect.w >= 40 && rect.h >= 34;
  const big = rect.w >= 120 && rect.h >= 100;
  return (
    <MapTooltip
      kind={heaviest ? 'Heaviest class' : 'Class'}
      title={service.className}
      services={[service]}
    >
      <ScopedLink
        to={to}
        search={{ className: service.className }}
        aria-label={`${service.className}: ${formatDuration(service.selfMs)} of own time, ${formatShare(service.share)}% of all · ${formatCount(service.calls)} calls at ${formatDuration(avgOwnMs(service))} each · ${formatCount(service.errorCount)} failed`}
        className={cn(
          'flex size-full flex-col justify-between overflow-hidden rounded-lg border transition-colors',
          rect.w >= 60 && rect.h >= 60 ? 'p-2.5' : 'p-1',
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
        ) : (
          <span />
        )}
      </ScopedLink>
    </MapTooltip>
  );
}

/** The classes without a tile, summed in one row. */
function Others({
  services,
  to,
}: {
  services: readonly ServiceDto[];
  to: string;
}) {
  const share = services.reduce((sum, service) => sum + service.share, 0);
  const selfMs = services.reduce((sum, service) => sum + service.selfMs, 0);
  const label = `${services.length} ${services.length === 1 ? 'class' : 'classes'}`;
  return (
    <MapTooltip kind="Everything else" title={label} services={services}>
      <ScopedLink
        to={to}
        aria-label={`Others, ${label}: ${formatDuration(selfMs)} of own time, ${formatShare(share)}% of all`}
        className="mx-[3px] flex h-8 items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/20 font-mono text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      >
        Others · {label}
        <span className="font-semibold text-foreground">
          {formatShare(share)}%
        </span>
        <span>{formatDuration(selfMs)}</span>
      </ScopedLink>
    </MapTooltip>
  );
}

/** Own time, calls and failures of one class or of a group of them. */
function MapTooltip({
  kind,
  title,
  services,
  children,
}: {
  kind: string;
  title: string;
  services: readonly ServiceDto[];
  children: ReactNode;
}) {
  const selfMs = services.reduce((sum, service) => sum + service.selfMs, 0);
  const share = services.reduce((sum, service) => sum + service.share, 0);
  const calls = services.reduce((sum, service) => sum + service.calls, 0);
  const failed = services.reduce((sum, service) => sum + service.errorCount, 0);
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="flex-col items-start gap-1 border bg-popover px-3 py-2.5 font-mono text-[11px] text-popover-foreground [&_svg]:hidden"
      >
        <span className="flex items-center gap-1.5 tracking-wider text-muted-foreground uppercase">
          <span className="size-2 rounded-[2px] bg-primary" aria-hidden />
          {kind}
        </span>
        <span className="font-semibold">{title}</span>
        <span>
          <span className="font-semibold">{formatDuration(selfMs)}</span> own
          time · {formatShare(share)}% of all
        </span>
        <span>
          {formatCount(calls)} calls at{' '}
          {formatDuration(calls > 0 ? selfMs / calls : 0)} each
        </span>
        {failed > 0 ? (
          <span className="text-primary">{formatCount(failed)} failed</span>
        ) : null}
        <span className="mt-1 w-full border-t pt-1.5 text-muted-foreground">
          {services.length === 1
            ? 'Click to open it in Services'
            : 'Click to open Services'}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
