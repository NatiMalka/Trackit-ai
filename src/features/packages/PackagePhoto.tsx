import { useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { motion } from 'motion/react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { compressPackageImage, imageErrorMessage } from '../../lib/image';
import { spring } from '../../lib/motion';
import type { Stage } from '../tracking/stages';
import { StageRing } from './StageRing';

const SIZES = {
  sm: 56,
  md: 88,
  lg: 112,
} as const;

/**
 * Product shot for a package. Falls back to the stage ring so a card without a
 * photo still has a recognizable glyph. A tiny ring sits on the photo like a
 * shipping stamp so progress is not lost.
 */
export function PackagePhoto({
  src,
  alt,
  size = 'sm',
  stage,
  maxLadderIndex,
  live,
  layoutId,
  className,
}: {
  src?: string;
  alt: string;
  size?: keyof typeof SIZES;
  stage: Stage;
  maxLadderIndex?: number;
  live?: boolean;
  layoutId?: string;
  className?: string;
}) {
  const px = SIZES[size];
  const photo = src?.trim();

  if (!photo) {
    return (
      <StageRing
        stage={stage}
        maxLadderIndex={maxLadderIndex}
        size={px}
        layoutId={layoutId}
        live={live}
        className={className}
      />
    );
  }

  const badge = size === 'sm' ? 26 : 32;

  return (
    <motion.div
      layoutId={layoutId}
      className={cn('relative shrink-0', className)}
      style={{ width: px, height: px }}
    >
      <img
        src={photo}
        alt={alt}
        width={px}
        height={px}
        decoding="async"
        className="size-full rounded-2xl object-cover shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(255,255,255,0.14)]"
      />
      <div className="pointer-events-none absolute -end-1 -bottom-1 drop-shadow-md">
        <StageRing stage={stage} maxLadderIndex={maxLadderIndex} size={badge} live={false} />
      </div>
    </motion.div>
  );
}

function HiddenFileInput({
  inputRef,
  onFile,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      tabIndex={-1}
      aria-hidden
      className="sr-only"
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) onFile(file);
      }}
    />
  );
}

/** Camera/gallery tile used on add and edit. Stores a compressed JPEG data URL. */
export function PackagePhotoPicker({
  value,
  onChange,
  disabled,
}: {
  value?: string;
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = value?.trim();

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await compressPackageImage(file));
    } catch (err) {
      setError(imageErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-muted">תמונה של המוצר</p>
      <div className="flex items-center gap-3">
        <motion.button
          type="button"
          disabled={disabled || busy}
          whileTap={disabled || busy ? undefined : { scale: 0.97 }}
          transition={spring}
          onClick={() => inputRef.current?.click()}
          aria-label={photo ? 'החלף תמונה' : 'הוסף תמונה של המוצר'}
          className={cn(
            'relative grid size-[7.25rem] shrink-0 place-items-center overflow-hidden rounded-2xl',
            'border border-dashed border-line-strong',
            'bg-[radial-gradient(ellipse_at_top,var(--color-primary-soft),transparent_68%)] bg-elevated/80',
            'transition-colors duration-150 hover:border-primary/50',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            'disabled:opacity-50',
            photo && 'border-solid border-transparent bg-none',
          )}
        >
          {photo ? (
            <img src={photo} alt="" decoding="async" className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1.5 text-subtle">
              <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
                {busy ? (
                  <Camera aria-hidden className="size-5 animate-pulse" />
                ) : (
                  <ImagePlus aria-hidden className="size-5" />
                )}
              </span>
              <span className="text-[0.7rem] font-medium">{busy ? 'מעבד…' : 'הוסף תמונה'}</span>
            </span>
          )}
          {photo && (
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/75 to-transparent py-1.5 text-[0.65rem] font-medium text-white">
              <Camera aria-hidden className="size-3" />
              החלף
            </span>
          )}
        </motion.button>

        {photo && (
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setError(null);
            }}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-st-problem-soft hover:text-st-problem"
          >
            <X aria-hidden className="size-4" />
            הסר תמונה
          </button>
        )}
      </div>
      <p className="text-xs text-subtle">מהמצלמה או מהגלריה — כדי לזהות את החבילה במבט, בלי לזכור מספרים.</p>
      {error && <p className="text-xs text-st-problem">{error}</p>}
      <HiddenFileInput inputRef={inputRef} onFile={(file) => void handleFile(file)} />
    </div>
  );
}

/** 56px tap target for a found-package row when adding several at once. */
export function PackagePhotoThumbPicker({
  value,
  onChange,
  disabled,
}: {
  value?: string;
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photo = value?.trim();

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      onChange(await compressPackageImage(file));
    } catch {
      onChange(undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <motion.button
        type="button"
        disabled={disabled || busy}
        whileTap={disabled || busy ? undefined : { scale: 0.96 }}
        transition={spring}
        onClick={() => inputRef.current?.click()}
        aria-label={photo ? 'החלף תמונה' : 'הוסף תמונה'}
        className={cn(
          'relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl',
          'border border-dashed border-line-strong bg-elevated text-primary',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'disabled:opacity-50',
          photo && 'border-solid border-transparent',
        )}
      >
        {photo ? (
          <img src={photo} alt="" decoding="async" className="size-full object-cover" />
        ) : busy ? (
          <Camera aria-hidden className="size-5 animate-pulse" />
        ) : (
          <ImagePlus aria-hidden className="size-5" />
        )}
      </motion.button>
      <HiddenFileInput inputRef={inputRef} onFile={(file) => void handleFile(file)} />
    </>
  );
}
