# TrackIt AI

Hebrew-first, RTL package tracker built as an installable PWA on Firebase.

Live: https://trackit-ai-app.web.app

Existing trackers hand you the carrier's own words — `Import clearance success`,
`Departed from local distribution center`, `退回` — and leave you to guess. TrackIt AI
answers the only three questions anyone actually has, in Hebrew, at the top of every
package: **where is it, is something wrong, and when will it arrive.**

## How it works

Two layers, deliberately separated:

1. **The stage normalizer is deterministic, not AI.** Keyword and carrier-code matching
   (including Chinese source strings) collapses any raw event into one of nine canonical
   stages, instantly, offline, for free. This is what the whole UI reads from.
2. **Gemini only explains and predicts.** Every AI call has a deterministic fallback that
   returns the same shape, so the app is fully functional with AI switched off, offline,
   or unconfigured. Results are cached against a hash of the event log, so a package costs
   tokens once per real status change rather than once per render.

The stage ladder:

`CREATED` → `PICKED_UP` → `ORIGIN_TRANSIT` → `INTERNATIONAL` → `ARRIVED_IL` → `CUSTOMS` →
`LOCAL_DELIVERY` → `AWAITING_PICKUP` → `DELIVERED`, plus off-ladder `EXCEPTION` and
`RETURNED`.

`AWAITING_PICKUP` carries a `deadlineAt` (~14 days) driving a live countdown. This one
feature prevents the most infuriating failure mode in Israel: a package returned to
sender because nobody told you a clock was running.

## Stack

- Vite, React, TypeScript, React Router
- Tailwind CSS v4 with CSS-first tokens and logical properties, so RTL needs no per-component work
- `motion` for animation, `lucide-react` for icons
- `vite-plugin-pwa` with `strategies: 'injectManifest'` and a custom `src/sw.ts` — chosen so
  Firebase Cloud Messaging lives in the *same* worker instead of fighting a second one for the `/` scope
- Firebase Hosting, Anonymous Auth, Firestore, App Check, AI Logic (Gemini Developer API)

## Running locally

```bash
npm install
npm run dev
```

It works with no configuration at all: without a Firebase project the app stores packages
in `localStorage` and uses the deterministic normalizer for every explanation.

Open Settings for a list of demo tracking numbers (`DEMOCUSTOMS222`, `DEMOPICKUP261`,
`DEMOSTUCK571`, …). Each one generates a different journey — stuck in customs, long
silence, awaiting pickup, returned — so you can see every state without a real API.

```bash
npm test          # unit tests for the normalizer, mock provider, formatting, notification rules
npm run build     # typecheck + production build + service worker
npm run icons     # rasterize public/icons/favicon.svg into the PWA icon set
npm run deploy    # build + firebase deploy
```

## Firebase setup

`.env.local` holds the web app config (already filled in for `trackit-ai-app`). Every
`VITE_` value is embedded in the client bundle — that is expected for Firebase web config,
which is why Firestore rules and App Check do the real security work. See `.env.example`
for a blank template.

Hosting, Firestore rules and Firestore indexes are deployed. Three things still need a
click in the console, and the app degrades cleanly until each one is done:

| What | Where | Until then |
| --- | --- | --- |
| Anonymous Auth | Authentication → Sign-in method → Anonymous | Packages stay in `localStorage` on one device; Settings says so |
| Firebase AI Logic | Build → AI Logic → enable the Gemini Developer API | Explanations come from the deterministic normalizer |
| App Check | Security → App Check → register the web app with reCAPTCHA Enterprise, then set `VITE_RECAPTCHA_SITE_KEY` | Requests are unattested; **enforcement becomes mandatory for AI Logic on 2026-11-02** |

For App Check on localhost, set `VITE_APPCHECK_DEBUG_TOKEN=true`, load the app once, and
paste the token it logs into App Check → Manage debug tokens.

## Tracking data

`src/features/tracking/provider.ts` defines the seam:

```ts
interface TrackingProvider {
  id: 'mock' | 'api';
  label: string;
  track(trackingNumber: string, carrier?: string): Promise<TrackingResult>;
}
```

`mockProvider` generates deterministic multi-leg histories from a hash of the tracking
number. `apiProvider` calls the `trackPackage` Cloud Function so the tracking API key
never reaches the bundle. Switch with `VITE_TRACKING_PROVIDER=mock | api`; nothing else in
the app knows the difference.

Cloud Functions require the Blaze plan, which is why Phases 0–2 run entirely on Spark at
zero cost.

## Cloud Functions (needs Blaze)

`functions/` holds two functions, both in `europe-west1` and both sharing the *same*
normalizer and notification rules as the client via relative imports into `src/` — the
promise that a status means one thing everywhere has to hold in exactly one place.

| Function | Trigger | Job |
| --- | --- | --- |
| `trackPackage` | `onCall` | Proxies Ship24 so the API key stays a server-side secret. Enforces App Check, requires (anonymous) auth, batches up to 25 numbers per round trip |
| `refreshPackages` | every 60 min | Polls stale non-terminal packages, writes back only what changed, and sends FCM for events that change what you'd do |

To turn it on:

```bash
firebase functions:secrets:set SHIP24_API_KEY   # paste the key, never commit it
firebase deploy --only functions,firestore:indexes
```

Then set `VITE_TRACKING_PROVIDER=api` and rebuild. Nothing above the provider interface
changes.

The refresh loop is built to be cheap: terminal and archived packages are never polled
again, anything the app itself refreshed in the last four hours is skipped, an unchanged
event hash writes a single timestamp, and a hard cap of 400 packages per run keeps a
runaway fan-out from becoming a billing incident. Dead FCM tokens are pruned, but only on
errors that mean the device is permanently gone.

Notifications only fire for: landed in Israel, held at customs, out for delivery, waiting
for pickup, the pickup deadline approaching, a package going unusually quiet, delivery, and
return to sender. Each is deduped by key on the package document, so a re-poll of the same
state never sends twice.

## Layout

```
src/
  app/routes/          four screens: list, add, detail, settings
  components/ui/       Button, Card, Chip, Sheet, Field, Toast, Skeleton, EmptyState
  components/layout/   AppShell (bottom nav < 1024px, sidebar above), PageHeader, PwaBanners
  features/tracking/   stage ladder, normalizer, carrier detection, providers
  features/packages/   Firestore/local repository, store, cards, timeline, route arc
  features/ai/         Gemini wiring, prompts, insights, chat
  features/notifications/  preferences, push registration, which events are worth a banner
  lib/                 Hebrew formatting, motion presets, theme, Firebase init
  sw.ts                service worker: precache, SPA offline, FCM push
```

## Design notes

Dark-first, flat, information-dense, deliberately avoiding the purple/pink "AI gradient"
look — this should read as a logistics instrument, not a chatbot.

- **Type:** Rubik for headings and numerals, Heebo for body. Both are Hebrew-native, not
  Latin faces with a bolted-on Hebrew subset. Tabular figures for anything in a column.
- **Colour:** ink `#0b0e14`, tracking blue `#2e7dff`, delivery orange `#ff7a29`. Status is
  always paired with an icon and a Hebrew label, never colour alone.
- **Motion:** springs, 150–300ms, 40ms stagger on list entry, shared-element morph from
  list card into the detail header. Gated behind `prefers-reduced-motion`, and skipped
  entirely when the document is hidden so nothing can freeze mid-fade in a background tab.
