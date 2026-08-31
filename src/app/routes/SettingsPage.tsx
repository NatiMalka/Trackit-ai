import { motion } from 'motion/react';
import { useState } from 'react';
import { Cloud, Copy, Database, Download, Moon, Sparkles, Sun, TestTube2, Truck } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { Switch } from '../../components/ui/Field';
import { PageHeader } from '../../components/layout/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';
import { packageCount } from '../../lib/format';
import { listContainer, listItem } from '../../lib/motion';
import { useTheme } from '../../lib/theme';
import { isFirebaseConfigured } from '../../lib/firebase';
import { GEMINI_MODEL, isAiAvailable } from '../../features/ai/gemini';
import { usePackages } from '../../features/packages/store';
import { getProvider } from '../../features/tracking';
import { MOCK_SCENARIO_HINTS } from '../../features/tracking/mockProvider';
import { useNotificationPrefs } from '../../features/notifications/prefs';

function Row({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-2 text-sm text-muted">
        {icon}
        {label}
      </span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { packages, storage, uid } = usePackages();
  const { prefs, setPref, permission, requestPermission } = useNotificationPrefs();
  const { toast } = useToast();
  const [showDemos, setShowDemos] = useState(false);

  const provider = getProvider();

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(packages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trackit-packages-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('הנתונים יוצאו לקובץ', { kind: 'success' });
  };

  const copyDemo = async (example: string) => {
    try {
      await navigator.clipboard.writeText(example);
      toast(`${example} הועתק — הדבק אותו בהוספת חבילה`, { kind: 'success' });
    } catch {
      toast('לא הצלחנו להעתיק', { kind: 'error' });
    }
  };

  return (
    <>
      <PageHeader title="הגדרות" />

      <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-4">
        <motion.div variants={listItem}>
          <Card className="space-y-1">
            <CardTitle className="mb-2">תצוגה</CardTitle>
            <div className="flex items-center justify-between gap-4 py-1">
              <div>
                <p className="text-[0.95rem] font-medium">מצב כהה</p>
                <p className="text-xs text-subtle">ברירת המחדל עוקבת אחרי הגדרות המערכת</p>
              </div>
              <IconButton label={theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'} onClick={toggle}>
                {theme === 'dark' ? <Moon className="size-5" /> : <Sun className="size-5" />}
              </IconButton>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={listItem}>
          <Card className="space-y-3">
            <CardTitle>התראות</CardTitle>
            <Switch
              label="עדכונים חשובים בלבד"
              description="נחתה בישראל, נכנסה למכס, יצאה לחלוקה, ממתינה לאיסוף, או נתקעה. בלי כל סריקה קטנה בדרך."
              checked={prefs.milestonesOnly}
              onChange={(v) => setPref('milestonesOnly', v)}
            />
            <Switch
              label="תזכורת לפני שהחבילה חוזרת לשולח"
              description="שלוש התראות: שלושה ימים לפני התאריך, יום לפני, וביום עצמו."
              checked={prefs.pickupReminders}
              onChange={(v) => setPref('pickupReminders', v)}
            />
            <Switch
              label="התראה על חבילה תקועה"
              description="כשהשקט חורג ממה שנורמלי לשלב שבו החבילה נמצאת."
              checked={prefs.stuckAlerts}
              onChange={(v) => setPref('stuckAlerts', v)}
            />

            {permission !== 'granted' && (
              <div className="rounded-xl bg-elevated p-3">
                <p className="mb-2 text-xs leading-relaxed text-muted">
                  {permission === 'denied'
                    ? 'הדפדפן חוסם התראות עבור האתר. אפשר לשנות זאת בהגדרות האתר בדפדפן.'
                    : 'כדי לקבל התראות גם כשהאפליקציה סגורה, צריך לאשר התראות בדפדפן.'}
                </p>
                <Button size="sm" onClick={requestPermission} disabled={permission === 'denied'}>
                  אפשר התראות
                </Button>
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div variants={listItem}>
          <Card>
            <CardTitle className="mb-1">מקור הנתונים</CardTitle>
            <Row label="ספק מעקב" value={provider.label} icon={<Truck aria-hidden className="size-4" />} />
            <Row
              label="אחסון"
              value={storage === 'firestore' ? 'Firestore (מסונכרן)' : 'מקומי במכשיר הזה'}
              icon={storage === 'firestore' ? <Cloud aria-hidden className="size-4" /> : <Database aria-hidden className="size-4" />}
            />
            <Row
              label="בינה מלאכותית"
              value={isAiAvailable() ? GEMINI_MODEL : 'לא זמין (אופליין או ללא הגדרה)'}
              icon={<Sparkles aria-hidden className="size-4" />}
            />
            {!isFirebaseConfigured ? (
              <p className="mt-2 rounded-xl bg-st-action-soft p-3 text-xs leading-relaxed text-st-action">
                Firebase לא מוגדר, ולכן החבילות נשמרות מקומית בדפדפן וההסברים החכמים כבויים. ראה
                README להשלמת ההגדרה.
              </p>
            ) : (
              storage === 'local' && (
                <p className="mt-2 rounded-xl bg-st-action-soft p-3 text-xs leading-relaxed text-st-action">
                  לא הצלחנו להתחבר ל‑Firestore, ולכן החבילות נשמרות מקומית בדפדפן הזה בלבד. בדוק
                  שהפעלת Firestore והתחברות אנונימית בקונסולה של Firebase.
                </p>
              )
            )}
          </Card>
        </motion.div>

        {provider.id === 'mock' && (
          <motion.div variants={listItem}>
            <Card>
              <button
                type="button"
                onClick={() => setShowDemos((v) => !v)}
                aria-expanded={showDemos}
                className="flex w-full items-center gap-2 text-start"
              >
                <TestTube2 aria-hidden className="size-4 text-primary" />
                <span className="flex-1 text-sm font-semibold">מספרי מעקב להדגמה</span>
                <span className="text-xs text-subtle">{showDemos ? 'הסתר' : 'הצג'}</span>
              </button>
              <motion.div
                initial={false}
                animate={{ height: showDemos ? 'auto' : 0, opacity: showDemos ? 1 : 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  כל מספר כאן מייצר מסלול אחר, כולל תקיעות במכס, שקט ארוך והמתנה לאיסוף. שימושי כדי
                  לראות איך האפליקציה מתנהגת בכל מצב.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {MOCK_SCENARIO_HINTS.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void copyDemo(s.example)}
                        className={cn(
                          'ltr tnum flex items-center gap-1.5 rounded-lg bg-elevated px-2 py-1 text-xs font-medium',
                          'hover:bg-primary-soft hover:text-primary',
                        )}
                      >
                        <Copy aria-hidden className="size-3" />
                        {s.example}
                      </button>
                      <span className="min-w-0 flex-1 truncate text-xs text-subtle">{s.label}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </Card>
          </motion.div>
        )}

        <motion.div variants={listItem}>
          <Card className="space-y-3">
            <CardTitle>הנתונים שלי</CardTitle>
            <p className="text-xs leading-relaxed text-muted">
              האפליקציה לא מבקשת הרשמה. {storage === 'firestore' ? 'מזהה אנונימי נוצר אוטומטית ומשמש רק כדי לשמור את החבילות שלך.' : 'הנתונים נשמרים בדפדפן הזה בלבד.'}
            </p>
            {uid && <p className="ltr text-[0.7rem] text-subtle">מזהה: {uid}</p>}
            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={packages.length === 0}
              icon={<Download className="size-4" />}
            >
              ייצוא לקובץ JSON
            </Button>
          </Card>
        </motion.div>

        <motion.p variants={listItem} className="pb-4 text-center text-xs text-subtle">
          TrackIt AI · {packageCount(packages.length)} במעקב
        </motion.p>
      </motion.div>
    </>
  );
}
