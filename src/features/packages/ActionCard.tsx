import { motion } from 'motion/react';
import { ExternalLink, ListChecks } from 'lucide-react';
import { cn } from '../../lib/cn';
import { dayCount, formatDate } from '../../lib/format';
import { enterFrom, spring, useEnterAnimation } from '../../lib/motion';
import { carrierInfo } from '../tracking/carriers';
import { daysUntilDeadline } from '../tracking/normalize';
import type { TrackedPackage } from '../tracking/types';

/** Concrete steps per stage. Generic advice is useless; these name the actual action. */
function actionsFor(pkg: TrackedPackage): { title: string; steps: string[] } | null {
  switch (pkg.stage) {
    case 'AWAITING_PICKUP': {
      const days = daysUntilDeadline(pkg.deadlineAt);
      return {
        title: days !== undefined && days <= 0 ? 'חלף מועד האיסוף' : 'צריך לאסוף את החבילה',
        steps: [
          pkg.deadlineAt
            ? `אסוף עד ${formatDate(pkg.deadlineAt)}${days !== undefined && days > 0 ? ` — נותרו ${dayCount(days)}` : ''}. אחרי התאריך הזה החבילה מוחזרת לשולח.`
            : 'אסוף בהקדם — נקודות איסוף שומרות חבילות לזמן מוגבר בלבד.',
          'קח תעודה מזהה ואת מספר המעקב.',
          'אם אין לך הודעה עם מספר הסניף, בדוק באתר השליח לפי מספר המעקב.',
        ],
      };
    }
    case 'CUSTOMS':
      return {
        title: 'החבילה במכס',
        steps: [
          'ברוב המקרים השחרור קורה מעצמו תוך כמה ימים — אין מה לעשות.',
          'אם נדרשת חשבונית: צלם את דף ההזמנה עם הסכום ששילמת והעלה באתר השליח.',
          'מעל 75 דולר משלמים מע״מ, ומעל 500 דולר גם מכס. תשלום מקוון מזרז את השחרור.',
        ],
      };
    case 'EXCEPTION':
      return {
        title: 'משהו לא עבד',
        steps: [
          'בדוק שהכתובת והטלפון אצל השליח נכונים — זו הסיבה הנפוצה ביותר.',
          'פנה לשליח עם מספר המעקב ובקש ניסיון מסירה נוסף.',
          'אם אין התקדמות תוך שבוע, פתח מחלוקת אצל המוכר בזירת הקנייה.',
        ],
      };
    case 'RETURNED':
      return {
        title: 'החבילה חוזרת לשולח',
        steps: [
          'פתח בקשת החזר כספי אצל המוכר וצרף צילום מסך של הסטטוס.',
          'שמור את מספר המעקב — הוא ההוכחה שהחבילה לא נמסרה לך.',
        ],
      };
    default:
      return null;
  }
}

/**
 * Shown only when the user genuinely has something to do. An always-present
 * "what to do" card trains people to ignore it.
 */
export function ActionCard({ pkg }: { pkg: TrackedPackage }) {
  const animate = useEnterAnimation();
  const action = actionsFor(pkg);
  if (!action) return null;

  const carrier = carrierInfo(pkg.carrier);
  const url = carrier.trackingUrl?.(pkg.trackingNumber);
  const urgent = pkg.stage === 'EXCEPTION' || pkg.stage === 'RETURNED';

  return (
    <motion.section
      initial={enterFrom(animate, { opacity: 0, y: 10 })}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.05 }}
      aria-label="מה לעשות"
      className={cn(
        'rounded-card border p-4',
        urgent ? 'border-st-problem/30 bg-st-problem-soft' : 'border-st-action/30 bg-st-action-soft',
      )}
    >
      <h2 className="mb-2.5 flex items-center gap-2 font-display text-base font-semibold">
        <ListChecks aria-hidden className={cn('size-5', urgent ? 'text-st-problem' : 'text-st-action')} />
        {action.title}
      </h2>

      <ol className="space-y-2">
        {action.steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span
              aria-hidden
              className={cn(
                'tnum mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold',
                urgent ? 'bg-st-problem/20 text-st-problem' : 'bg-st-action/20 text-st-action',
              )}
            >
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          <ExternalLink aria-hidden className="size-4" />
          פתח באתר {carrier.name}
        </a>
      )}
    </motion.section>
  );
}
