import {
  Bike,
  CheckCheck,
  CircleHelp,
  PackageCheck,
  Plane,
  PlaneLanding,
  Receipt,
  ShieldAlert,
  Store,
  TriangleAlert,
  Truck,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { stageMeta, type Stage } from '../tracking/stages';

// One icon family, one stroke weight, resolved from the stage metadata so the
// mapping lives next to the stage definition rather than scattered in views.
const ICONS: Record<string, LucideIcon> = {
  receipt: Receipt,
  'package-check': PackageCheck,
  truck: Truck,
  plane: Plane,
  'plane-landing': PlaneLanding,
  'shield-alert': ShieldAlert,
  bike: Bike,
  store: Store,
  'check-check': CheckCheck,
  'triangle-alert': TriangleAlert,
  'undo-2': Undo2,
  'help-circle': CircleHelp,
};

export function StageIcon({ stage, className }: { stage: Stage; className?: string }) {
  const Icon = ICONS[stageMeta(stage).icon] ?? CircleHelp;
  return <Icon aria-hidden strokeWidth={1.75} className={cn('size-5', className)} />;
}
