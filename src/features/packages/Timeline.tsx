import { motion } from 'motion/react';
import { useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatDate, formatTime, relativeDays } from '../../lib/format';
import { enterFrom, spring, useEnterAnimation } from '../../lib/motion';
import { carrierInfo } from '../tracking/carriers';
import { countryName, groupIntoLegs } from '../tracking/normalize';
import { stageMeta, toneClass } from '../tracking/stages';
import type { TrackingEvent } from '../tracking/types';
import { CountryBadge } from './CountryBadge';
import { StageIcon } from './StageIcon';

function EventRow({ event, isLatest, index }: { event: TrackingEvent; isLatest: boolean; index: number }) {
  const [open, setOpen] = useState(false);
  const animate = useEnterAnimation();
  const meta = stageMeta(event.stage);
  const tone = toneClass(event.stage);

  return (
    <motion.li
      initial={enterFrom(animate, { opacity: 0, x: 12 })}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring, delay: Math.min(index, 8) * 0.035 }}
      className="relative ps-9"
    >
      {/* Rail sits on the inline-start edge, so it flips with direction for free. */}
      <span
        aria-hidden
        className={cn(
          'absolute start-3 top-0 h-full w-0.5',
          isLatest ? 'bg-gradient-to-b from-transparent to-line' : 'bg-line',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'absolute start-[0.3125rem] top-1.5 grid size-4 place-items-center rounded-full ring-4 ring-surface',
          isLatest ? tone.bg : 'bg-line',
        )}
      >
        {isLatest && <span className={cn('size-2 rounded-full bg-current', tone.fg)} />}
      </span>

      <div className="pb-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn('inline-flex items-center gap-1 text-sm font-semibold', isLatest ? tone.fg : 'text-fg')}>
            <StageIcon stage={event.stage} className="size-3.5" />
            {meta.label}
          </span>
          <time dateTime={event.at} className="tnum text-xs text-subtle">
            {formatDate(event.at)} · {formatTime(event.at)}
          </time>
          {isLatest && <span className="text-xs text-subtle">({relativeDays(event.at)})</span>}
        </div>

        {event.location && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{event.location}</span>
          </p>
        )}

        {/* The carrier's own words, always available. Users need to be able to
            check our interpretation, and some will search the raw text online. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-subtle hover:text-muted"
        >
          <ChevronDown aria-hidden className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')} />
          הטקסט המקורי מהשליח
        </button>

        <motion.div
          initial={false}
          animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <p dir="auto" className="mt-1.5 rounded-lg bg-elevated px-2.5 py-2 text-xs leading-relaxed text-muted">
            {event.rawText}
            {event.carrier && (
              <span className="mt-1 block text-subtle">דווח על ידי {carrierInfo(event.carrier).name}</span>
            )}
          </p>
        </motion.div>
      </div>
    </motion.li>
  );
}

/**
 * The full journey, grouped by country leg.
 *
 * Legs are how people actually reason about an international parcel ("it left
 * China, it is in Israel now"), and grouping makes the handoff between carriers
 * visible instead of hiding it inside a flat list of scans.
 */
export function Timeline({ events }: { events: TrackingEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
        עדיין לא התקבלו רשומות מעקב. שליחים לרוב מתחילים לדווח 2–5 ימים אחרי ההזמנה.
      </p>
    );
  }

  const legs = groupIntoLegs(events);
  let globalIndex = 0;

  return (
    <div className="space-y-4">
      {legs.map((leg, legIdx) => {
        return (
          <section key={`${leg.countryCode ?? 'unknown'}-${legIdx}`}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-subtle">
              <CountryBadge code={leg.countryCode} />
              {countryName(leg.countryCode)}
              <span className="tnum font-normal normal-case">
                ({leg.events.length} {leg.events.length === 1 ? 'עדכון' : 'עדכונים'})
              </span>
            </h3>
            {/* Rows carry their own delay keyed off the global index, so the
                draw-in continues across leg boundaries instead of restarting. */}
            <ol>
              {leg.events.map((event) => {
                const idx = globalIndex++;
                return <EventRow key={`${event.at}-${idx}`} event={event} isLatest={idx === 0} index={idx} />;
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
