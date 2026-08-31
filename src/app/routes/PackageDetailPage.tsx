import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowRight,
  Copy,
  MessageCircleQuestion,
  PackageSearch,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button';
import { Tag } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { prettyTracking } from '../../lib/format';
import { enterFrom, spring, tween, useEnterAnimation } from '../../lib/motion';
import { useInsight } from '../../features/ai/useInsight';
import { ActionCard } from '../../features/packages/ActionCard';
import { ChatSheet } from '../../features/packages/ChatSheet';
import { DeliveryCelebration } from '../../features/packages/DeliveryCelebration';
import { InsightCard } from '../../features/packages/InsightCard';
import { PackagePhoto, PackagePhotoPicker } from '../../features/packages/PackagePhoto';
import { RouteArc } from '../../features/packages/RouteArc';
import { StageLadder } from '../../features/packages/StageLadder';
import { Timeline } from '../../features/packages/Timeline';
import { usePackage, usePackages } from '../../features/packages/store';
import { carrierInfo, defaultPackageTitle, SOURCE_LABEL } from '../../features/tracking/carriers';
import { stageMeta } from '../../features/tracking/stages';
import { COLOR_SWATCH, PACKAGE_COLORS, type PackageColor } from '../../features/tracking/types';

export function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pkg, loading } = usePackage(id);
  const { refreshPackage, removePackage, restorePackage, updatePackage, refreshing } = usePackages();
  const { insight, generating } = useInsight(pkg);
  const { toast } = useToast();
  const enter = useEnterAnimation();

  const [chatOpen, setChatOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemImage, setItemImage] = useState('');
  const [color, setColor] = useState<PackageColor>('blue');

  useEffect(() => {
    if (!pkg) return;
    setNickname(pkg.nickname ?? '');
    setItemName(pkg.itemName ?? '');
    setItemImage(pkg.itemImage ?? '');
    setColor((pkg.colorTag as PackageColor) ?? 'blue');
  }, [pkg]);

  useEffect(() => {
    if (!pkg?.unread) return;
    void updatePackage(pkg.id, { unread: false });
  }, [pkg?.id, pkg?.unread, updatePackage]);

  if (loading && !pkg) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    );
  }

  if (!pkg) {
    return (
      <EmptyState
        icon={<PackageSearch aria-hidden strokeWidth={1.5} className="size-9" />}
        title="החבילה לא נמצאה"
        body="ייתכן שהיא נמחקה, או שהקישור שגוי."
        action={
          <ButtonLink to="/">חזרה לרשימה</ButtonLink>
        }
      />
    );
  }

  const meta = stageMeta(pkg.stage);
  const carrier = carrierInfo(pkg.carrier);
  const title = pkg.nickname || pkg.itemName || defaultPackageTitle(pkg.source, pkg.trackingNumber);
  const isRefreshing = refreshing.has(pkg.id);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pkg.trackingNumber);
      toast('מספר המעקב הועתק', { kind: 'success' });
    } catch {
      toast('לא הצלחנו להעתיק. סמן והעתק ידנית.', { kind: 'error' });
    }
  };

  const handleDelete = async () => {
    const snapshot = pkg;
    await removePackage(pkg.id);
    navigate('/', { replace: true });
    // Undo rather than a confirm dialog: one tap to delete, one tap to change
    // your mind, no modal in the way of the common case.
    toast('החבילה הוסרה', { kind: 'info', undo: () => void restorePackage(snapshot) });
  };

  const handleSaveEdits = async () => {
    await updatePackage(pkg.id, {
      nickname: nickname.trim() || undefined,
      itemName: itemName.trim() || undefined,
      // Empty string clears a stored photo; undefined would leave the old one.
      itemImage: itemImage.trim() || '',
      colorTag: color,
    });
    setEditOpen(false);
    toast('הפרטים עודכנו', { kind: 'success' });
  };

  return (
    <>
      {pkg.stage === 'DELIVERED' && <DeliveryCelebration packageId={pkg.id} />}

      <motion.div
        initial={enterFrom(enter, { opacity: 0 })}
        animate={{ opacity: 1 }}
        transition={tween}
        className="space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <IconButton label="חזרה לרשימה" onClick={() => navigate('/')}>
            {/* Points back along the reading direction in RTL. */}
            <ArrowRight className="size-5" />
          </IconButton>
          <div className="flex items-center gap-1">
            <IconButton label="ערוך פרטים" onClick={() => setEditOpen(true)}>
              <Pencil className="size-5" />
            </IconButton>
            <IconButton
              label="רענן חבילה"
              onClick={() => void refreshPackage(pkg.id)}
              disabled={isRefreshing}
            >
              <RefreshCw className={isRefreshing ? 'size-5 animate-spin' : 'size-5'} />
            </IconButton>
            <IconButton label="הסר חבילה" variant="quiet-danger" onClick={handleDelete}>
              <Trash2 className="size-5" />
            </IconButton>
          </div>
        </div>

        {/* Photo (or ring) morphs from the list card, so entering feels like zooming in. */}
        <header className="relative overflow-hidden rounded-card border border-line bg-surface p-4">
          {pkg.itemImage?.trim() && (
            <img
              src={pkg.itemImage}
              alt=""
              aria-hidden
              decoding="async"
              className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-30 blur-2xl"
            />
          )}
          <div className="relative flex items-center gap-4">
            <PackagePhoto
              src={pkg.itemImage}
              alt={title}
              size="lg"
              stage={pkg.stage}
              maxLadderIndex={pkg.maxLadderIndex}
              layoutId={`ring-${pkg.id}`}
              live={pkg.stage !== 'DELIVERED' && pkg.stage !== 'RETURNED'}
            />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold leading-tight">{title}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Tag>{carrier.name}</Tag>
                <Tag>{SOURCE_LABEL[pkg.source]}</Tag>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="ltr tnum mt-1.5 flex items-center gap-1.5 text-xs text-subtle hover:text-muted"
              >
                <Copy aria-hidden className="size-3.5" />
                {prettyTracking(pkg.trackingNumber)}
              </button>
            </div>
          </div>
        </header>

        <div className="rounded-card border border-line bg-surface p-4">
          <StageLadder stage={pkg.stage} maxLadderIndex={pkg.maxLadderIndex} />
        </div>

        <InsightCard pkg={pkg} insight={insight} generating={generating} />

        <ActionCard pkg={pkg} />

        <Button
          variant="secondary"
          block
          size="lg"
          onClick={() => setChatOpen(true)}
          icon={<MessageCircleQuestion className="size-5" />}
        >
          שאל שאלה על החבילה
        </Button>

        <RouteArc events={pkg.events} stage={pkg.stage} maxLadderIndex={pkg.maxLadderIndex} />

        <section aria-label="מסלול החבילה">
          <h2 className="mb-3 font-display text-lg font-semibold">מסלול החבילה</h2>
          <Timeline events={pkg.events} />
        </section>

        <p className="pb-4 text-center text-xs text-subtle">
          שלב נוכחי: {meta.label}
          {pkg.lastCheckedAt && ` · נבדק לאחרונה ${new Date(pkg.lastCheckedAt).toLocaleString('he-IL')}`}
        </p>
      </motion.div>

      <ChatSheet pkg={pkg} open={chatOpen} onClose={() => setChatOpen(false)} />

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="עריכת פרטי החבילה">
        <div className="space-y-4">
          <TextField
            label="שם לחבילה"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="למשל: אוזניות לאבא"
            hint="השם שיופיע ברשימה."
          />
          <TextField
            label="מה יש בחבילה"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="למשל: אוזניות בלוטות'"
          />
          <PackagePhotoPicker value={itemImage} onChange={(next) => setItemImage(next ?? '')} />
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-muted">צבע לזיהוי מהיר</legend>
            <div className="flex gap-2">
              {PACKAGE_COLORS.map((c) => (
                <motion.button
                  key={c}
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  transition={spring}
                  onClick={() => setColor(c)}
                  aria-label={`צבע ${c}`}
                  aria-pressed={color === c}
                  className={`size-11 rounded-xl border-2 ${color === c ? 'border-fg' : 'border-transparent'}`}
                  style={{ background: COLOR_SWATCH[c] }}
                />
              ))}
            </div>
          </fieldset>
          <Button block size="lg" onClick={handleSaveEdits}>
            שמור
          </Button>
        </div>
      </Sheet>
    </>
  );
}
