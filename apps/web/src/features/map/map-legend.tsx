import type { MapNodeKind } from '@/lib/api/generated/api';
import type { ReactNode } from 'react';
import { NODE_ICONS, NODE_KIND_LABELS } from './map-style';

const LEGEND_KINDS: MapNodeKind[] = [
  'application',
  'queue',
  'database',
  'external',
];

function LegendItem({
  mark,
  children,
}: {
  mark: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5">
      {mark}
      {children}
    </li>
  );
}

/** What the node icons and the red links of the map mean. */
export function MapLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5 font-mono text-[10px] tracking-[0.8px] text-map-meta uppercase">
      {LEGEND_KINDS.map((kind) => {
        const Icon = NODE_ICONS[kind];
        return (
          <LegendItem
            key={kind}
            mark={
              <Icon
                className={
                  kind === 'application'
                    ? 'size-[13px] text-map-healthy'
                    : 'size-[13px] text-map-neutral'
                }
                aria-hidden
              />
            }
          >
            {NODE_KIND_LABELS[kind]}
          </LegendItem>
        );
      })}
      <LegendItem
        mark={
          <span
            className="h-0.5 w-[18px] rounded-sm bg-map-failing"
            aria-hidden
          />
        }
      >
        More than 1% failing
      </LegendItem>
    </ul>
  );
}
