import { defaultPackageTitle } from '../tracking/carriers';
import { assessHealth, daysUntilDeadline, hashEvents } from '../tracking/normalize';
import type { TrackedPackage } from '../tracking/types';
import {
  decideNotifications,
  shouldAnnounceUpdate,
  type NotificationDecision,
  type NotificationPrefs,
} from './rules';

/** Shared by the in-app poller and the scheduled Cloud Function. */
export function evaluatePackageNotifications(
  before: TrackedPackage,
  after: TrackedPackage,
  prefs: NotificationPrefs,
): NotificationDecision[] {
  const health = assessHealth(after);
  return decideNotifications(
    {
      packageId: after.id,
      title: after.nickname || after.itemName || defaultPackageTitle(after.source, after.trackingNumber),
      previousStage: before.stage,
      stage: after.stage,
      eventsChanged: hashEvents(after.events ?? []) !== hashEvents(before.events ?? []),
      eventsHash: hashEvents(after.events ?? []),
      latestEventText: after.events?.[0]?.rawText,
      daysUntilDeadline: daysUntilDeadline(after.deadlineAt),
      daysSilent: health.daysSilent,
      healthState: health.state,
    },
    prefs,
  );
}

export function unreadAndFresh(
  before: TrackedPackage,
  after: TrackedPackage,
  prefs: NotificationPrefs,
  changed: boolean,
): { unread: boolean; fresh: NotificationDecision[] } {
  const announce = shouldAnnounceUpdate(
    before.createdAt,
    before.events?.length ?? 0,
    after.events?.length ?? 0,
    changed,
  );
  if (!announce) return { unread: Boolean(before.unread), fresh: [] };

  const already = new Set(before.notified ?? []);
  const fresh = evaluatePackageNotifications(before, after, prefs).filter((d) => !already.has(d.dedupeKey));
  return { unread: true, fresh };
}
