import { detectCarrier } from '../tracking/carriers';
import { PACKAGE_COLORS, type PackageColor, type PackageDraft } from '../tracking/types';
import type { AeOrderCandidate } from './parseOrders';

/** Discovery metadata only — stage and timeline come from Ship24 after add. */
export function candidateToDraft(candidate: AeOrderCandidate, index = 0): PackageDraft {
  const guess = detectCarrier(candidate.trackingNumber);
  return {
    trackingNumber: candidate.trackingNumber,
    carrier: guess?.carrier ?? 'cainiao',
    source: 'aliexpress',
    itemName: candidate.itemName,
    itemImage: candidate.itemImage,
    aliexpressOrderId: candidate.aliexpressOrderId,
    colorTag: PACKAGE_COLORS[index % PACKAGE_COLORS.length] as PackageColor,
  };
}
