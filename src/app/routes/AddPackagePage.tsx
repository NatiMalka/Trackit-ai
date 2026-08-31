import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardPaste, PackagePlus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button';
import { Tag } from '../../components/ui/Chip';
import { TextAreaField, TextField } from '../../components/ui/Field';
import { PageHeader } from '../../components/layout/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';
import { enterFrom, fadeUp, listContainer, listItem, spring, useEnterAnimation } from '../../lib/motion';
import { parseAnything, type ParsedPackage } from '../../features/ai/insights';
import { isAiAvailable } from '../../features/ai/gemini';
import { usePackages } from '../../features/packages/store';
import { PackagePhotoPicker, PackagePhotoThumbPicker } from '../../features/packages/PackagePhoto';
import { carrierInfo, extractTrackingNumbers, SOURCE_LABEL } from '../../features/tracking/carriers';
import { packageCount, prettyTracking } from '../../lib/format';
import { COLOR_SWATCH, PACKAGE_COLORS, type PackageColor } from '../../features/tracking/types';

function ColorPicker({ value, onChange }: { value: PackageColor; onChange: (c: PackageColor) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-muted">צבע לזיהוי מהיר</legend>
      <div className="flex gap-2">
        {PACKAGE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`צבע ${c}`}
            aria-pressed={value === c}
            className={cn(
              'size-11 rounded-xl border-2 transition-transform duration-150 active:scale-95',
              value === c ? 'border-fg' : 'border-transparent',
            )}
            style={{ background: COLOR_SWATCH[c] }}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function AddPackagePage() {
  const navigate = useNavigate();
  const { addPackage } = usePackages();
  const { toast } = useToast();

  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [found, setFound] = useState<ParsedPackage[] | null>(null);
  const [nickname, setNickname] = useState('');
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [color, setColor] = useState<PackageColor>('blue');
  const [saving, setSaving] = useState(false);
  const enter = useEnterAnimation();

  const aiOn = isAiAvailable();

  const handleParse = async () => {
    if (text.trim().length < 6) return;
    setParsing(true);
    try {
      const results = await parseAnything(text, extractTrackingNumbers);
      setFound(results);
      if (results.length === 0) {
        toast('לא זיהינו מספר מעקב בטקסט. אפשר להדביק רק את המספר עצמו.', { kind: 'error' });
      }
    } finally {
      setParsing(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) return;
      setText(clip);
      // Parsing straight away turns a two-step chore into a single tap.
      setParsing(true);
      try {
        const results = await parseAnything(clip, extractTrackingNumbers);
        setFound(results);
      } finally {
        setParsing(false);
      }
    } catch {
      toast('הדפדפן לא איפשר קריאה מהלוח. הדבק ידנית בשדה.', { kind: 'error' });
    }
  };

  const removeFound = (tn: string) => {
    setFound((prev) => (prev ? prev.filter((p) => p.trackingNumber !== tn) : prev));
  };

  const handleSave = async () => {
    if (!found || found.length === 0) return;
    setSaving(true);
    try {
      const created = await Promise.all(
        found.map((p, i) =>
          addPackage({
            trackingNumber: p.trackingNumber,
            carrier: p.carrier,
            source: p.source,
            // A single package takes the typed nickname; a batch keeps the
            // AI-derived item names instead of forcing one label on all of them.
            nickname: found.length === 1 ? nickname.trim() || undefined : undefined,
            itemName: p.itemName,
            itemImage: photos[p.trackingNumber]?.trim() || undefined,
            colorTag: found.length === 1 ? color : PACKAGE_COLORS[i % PACKAGE_COLORS.length],
          }),
        ),
      );

      toast(found.length === 1 ? 'החבילה נוספה למעקב' : `${packageCount(found.length)} נוספו למעקב`, {
        kind: 'success',
      });
      navigate(created.length === 1 ? `/p/${created[0].id}` : '/', { replace: true });
    } catch (err) {
      console.error('[trackit] add failed', err);
      toast('לא הצלחנו לשמור. נסה שוב.', { kind: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="הוספת חבילה"
        subtitle="הדבק מספר מעקב, או את כל המייל מהמוכר — נחלץ את מה שצריך"
      />

      <div className="space-y-5">
        <div className="space-y-2">
          <TextAreaField
            label="מספר מעקב או טקסט חופשי"
            rows={5}
            dir="auto"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFound(null);
            }}
            // Hebrew first so dir="auto" resolves RTL while empty; once the user
            // pastes a Latin tracking number the value flips to LTR on its own.
            placeholder={'הדבק כאן מספר מעקב, או את כל המייל מהמוכר\n\nלמשל: LP00123456789012'}
            hint={
              aiOn
                ? 'אפשר להדביק מייל, SMS או צילום של דף הזמנה. נזהה את מספר המעקב, את השליח, ואת שם המוצר.'
                : 'זיהוי מספרי מעקב עובד גם ללא חיבור. זיהוי שם המוצר דורש חיבור לאינטרנט.'
            }
          />
          <div className="flex gap-2">
            <Button
              onClick={handleParse}
              loading={parsing}
              disabled={text.trim().length < 6}
              icon={<Wand2 className="size-4" />}
              className="flex-1"
            >
              {parsing ? 'מנתח…' : 'זהה חבילות'}
            </Button>
            <Button variant="secondary" onClick={handlePasteFromClipboard} icon={<ClipboardPaste className="size-4" />}>
              הדבק מהלוח
            </Button>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {found && found.length > 0 && (
            <motion.section
              key="found"
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit="exit"
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                <Sparkles aria-hidden className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">זיהינו {packageCount(found.length)}</h2>
              </div>

              <motion.ul variants={listContainer} initial="hidden" animate="show" className="space-y-2">
                {found.map((p) => (
                  <motion.li
                    key={p.trackingNumber}
                    variants={listItem}
                    layout
                    className="flex items-center gap-3 rounded-card border border-line bg-surface p-3.5"
                  >
                    {found.length > 1 ? (
                      <PackagePhotoThumbPicker
                        value={photos[p.trackingNumber]}
                        onChange={(next) =>
                          setPhotos((prev) => {
                            const copy = { ...prev };
                            if (next?.trim()) copy[p.trackingNumber] = next;
                            else delete copy[p.trackingNumber];
                            return copy;
                          })
                        }
                      />
                    ) : photos[p.trackingNumber] ? (
                      <img
                        src={photos[p.trackingNumber]}
                        alt=""
                        decoding="async"
                        className="size-10 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
                      >
                        <PackagePlus className="size-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="ltr tnum truncate text-sm font-semibold">{prettyTracking(p.trackingNumber)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Tag>{carrierInfo(p.carrier).name}</Tag>
                        <Tag>{SOURCE_LABEL[p.source]}</Tag>
                        {p.itemName && <Tag className="bg-primary-soft text-primary">{p.itemName}</Tag>}
                      </div>
                    </div>
                    {found.length > 1 && (
                      <IconButton label="הסר מהרשימה" onClick={() => removeFound(p.trackingNumber)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </motion.li>
                ))}
              </motion.ul>

              {found.length === 1 && (
                <motion.div variants={fadeUp} className="space-y-4 rounded-card border border-line bg-surface p-4">
                  <TextField
                    label="שם לחבילה"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={found[0].itemName || 'למשל: אוזניות לאבא'}
                    hint="עוזר לזהות את החבילה ברשימה בלי לזכור מספרים."
                  />
                  <PackagePhotoPicker
                    value={photos[found[0].trackingNumber]}
                    onChange={(next) =>
                      setPhotos((prev) => {
                        const key = found[0].trackingNumber;
                        const copy = { ...prev };
                        if (next?.trim()) copy[key] = next;
                        else delete copy[key];
                        return copy;
                      })
                    }
                  />
                  <ColorPicker value={color} onChange={setColor} />
                </motion.div>
              )}

              <Button size="lg" block loading={saving} onClick={handleSave} icon={<PackagePlus className="size-5" />}>
                {found.length === 1 ? 'הוסף למעקב' : `הוסף ${packageCount(found.length)} למעקב`}
              </Button>
            </motion.section>
          )}
        </AnimatePresence>

        <motion.aside
          initial={enterFrom(enter, { opacity: 0 })}
          animate={{ opacity: 1 }}
          transition={{ ...spring, delay: 0.1 }}
          className="rounded-card border border-line bg-surface/60 p-4 text-sm leading-relaxed text-muted"
        >
          <h2 className="mb-1.5 font-semibold text-fg">איפה מוצאים את מספר המעקב?</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>AliExpress — בהזמנה, תחת ״פרטי מסירה״, מספר שמתחיל ב-LP, AE או AP.</li>
            <li>SHEIN — במייל האישור, שדה Tracking Number.</li>
            <li>Amazon — בדף ההזמנה, מספר שמתחיל ב-TBA או 1Z.</li>
          </ul>
        </motion.aside>
      </div>
    </>
  );
}
