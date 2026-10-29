import { chartTooltip } from '@/components/charts/chart-tooltip';
import {
  ChartCaption,
  ChartRange,
  CountBadge,
  Panel,
  PanelBody,
  PanelHeader,
} from '@/components/panel';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UserActivityBucketDto } from '@/lib/api/generated/api';
import { formatCount } from '@/lib/format';
import { formatClock, formatLongDate } from '@/lib/stats';
import { useState } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';

type Measure = 'users' | 'requests';

const config: ChartConfig = {
  users: { label: 'Active users', color: 'var(--bar)' },
  requests: { label: 'Requests', color: 'var(--bar)' },
};

/** Distinct users in the range, and active users (or requests) per bucket. */
export function UserActivityPanel({
  userCount,
  timeline,
}: {
  userCount: number;
  timeline: readonly UserActivityBucketDto[];
}) {
  const [measure, setMeasure] = useState<Measure>('users');
  const peak = timeline.reduce<UserActivityBucketDto | null>(
    (best, b) => (!best || b[measure] > best[measure] ? b : best),
    null,
  );

  return (
    <Panel>
      <PanelHeader
        title="Users"
        aside={
          <Tabs
            value={measure}
            onValueChange={(value) => setMeasure(value as Measure)}
          >
            <TabsList aria-label="Chart measure">
              <TabsTrigger value="users" className="px-2.5 text-xs">
                Users
              </TabsTrigger>
              <TabsTrigger value="requests" className="px-2.5 text-xs">
                Requests
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        <CountBadge>{formatCount(userCount)}</CountBadge>
      </PanelHeader>
      <PanelBody>
        <ChartContainer config={config} className="aspect-auto h-56 w-full">
          <BarChart
            data={timeline as UserActivityBucketDto[]}
            barCategoryGap="30%"
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis dataKey="t" hide />
            <YAxis hide />
            {chartTooltip(config, formatCount)}
            <Bar
              dataKey={measure}
              fill={`var(--color-${measure})`}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
        <ChartCaption>
          {peak && peak[measure] > 0 ? (
            <>
              peak {formatCount(peak[measure])}{' '}
              {measure === 'users' ? 'active users' : 'requests'} at{' '}
              {formatClock(peak.t)}
            </>
          ) : null}
        </ChartCaption>
        {timeline.length > 0 ? (
          <ChartRange
            from={formatLongDate(timeline[0].t)}
            to={formatLongDate(timeline[timeline.length - 1].t)}
          />
        ) : null}
      </PanelBody>
    </Panel>
  );
}
