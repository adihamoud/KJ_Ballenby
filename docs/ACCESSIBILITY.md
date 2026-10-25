# Accessibility

How KJ Ballenby stays usable for everyone at the bar: people on screen readers (VoiceOver and
TalkBack, in Hebrew and English), keyboard and switch users, people who zoom or enlarge text, and
anyone reading a phone in the dark. The `accessibility` agent owns this document; ADR-013 records
the decision.

## Standard

- **WCAG 2.2 level AA** on every page, in both locales and both directions.
- **Israel**: the Equal Rights for Persons with Disabilities (Accessibility Adjustments for
  Service) Regulations, 2013, regulation 35, require websites that serve the public to meet
  Israeli Standard **IS 5568** (WCAG 2.0 AA) and to publish an **accessibility statement**
  (הצהרת נגישות) naming an accessibility contact. WCAG 2.2 AA is a superset, so meeting it meets
  IS 5568. The statement is `/[locale]/accessibility`, linked from every footer (see
  "Accessibility statement" below).
- Project rules on top of AA: tap targets at least **44 x 44 px** (WCAG 2.5.8 asks for 24),
  body text at least **12 px**, nothing that only works by dragging.

## Automated checks

Each runs locally and in CI. A red check blocks merge like any other.

| Check                    | Where                                    | Fails when                                                                                                                                                      | CI job                      |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| ESLint `jsx-a11y` strict | `apps/web/eslint.config.mjs`             | missing alt/labels, click handlers on non-interactive elements, invalid ARIA, autofocus, bad hrefs                                                              | Lint, typecheck, unit tests |
| Scan coverage            | `apps/web/src/lib/a11y/routes.test.ts`   | a `page.tsx` has no entry in `src/lib/a11y/routes.ts`, or an entry points at a deleted route                                                                    | Lint, typecheck, unit tests |
| Colour tokens            | `apps/web/src/lib/a11y/contrast.test.ts` | a token pair in `globals.css` drops below 4.5:1 (text) or 3:1 (focus ring)                                                                                      | Lint, typecheck, unit tests |
| Diff check               | `scripts/check-a11y-diff.mjs`            | added lines block zoom, use a positive tabIndex, drop the focus outline, hide clickables (warnings: tiny text, raw colours, modal without focus hook, autoplay) | Accessibility (PRs only)    |
| axe-core                 | `apps/web/e2e/a11y.spec.ts`              | any WCAG 2.0-2.2 A/AA or axe best-practice violation on any page, `/he` and `/en`, Chromium and WebKit                                                          | Accessibility               |
| Keyboard and reflow      | `apps/web/e2e/a11y-keyboard.spec.ts`     | skip link not first, dialog focus escapes or is lost, horizontal scroll at 320 CSS px                                                                           | Accessibility               |

Run them locally with the `a11y` skill, or:

```bash
pnpm --filter @kj/web lint
pnpm --filter @kj/web test
pnpm a11y:diff
pnpm --filter @kj/web build
pnpm --filter @kj/web test:a11y
```

**Adding a page**: add an entry to `A11Y_SCANS` in `apps/web/src/lib/a11y/routes.ts` (the unit test
tells you when you forget). If the page only shows something after a click (a sheet, a dialog), add
a second entry with `open` and teach `prepare()` in `e2e/a11y.spec.ts` to open it.

**Deliberate exceptions**: put `a11y-ignore: <reason>` on the line (or the line above) for the diff
check, or `// eslint-disable-next-line jsx-a11y/<rule> -- reason` for lint. Never disable an axe
rule globally; if axe is wrong about one element, exclude that selector in the spec with a comment
and a link to the issue.

## How we build it

**Structure**

- Every page has exactly one `<main id="main">`; the root layout's skip link (`SkipLink`) targets
  it. Headers are `<header>`, navigation `<nav aria-label>`. A `<section>` gets a name only when it
  should be a landmark; repeated cards use headings instead.
- One `<h1>` per page, headings in order. Lists of things (queue, songs, tables) are `<ul>`/`<ol>`.
- `<html lang dir>` comes from the locale. User-entered text (names, song titles, notes) gets
  `dir="auto"`; codes, phone numbers and versions are `dir="ltr"` or `<bdi>`.

**Controls**

- Links go somewhere, buttons do something. No `div` with `onClick`.
- Icon-only buttons have an `aria-label` from next-intl, in both locales; the icon is
  `aria-hidden`.
- Every input has a visible `<label>` (placeholders are hints, not labels). Errors set
  `aria-invalid` and are tied to the field with `aria-describedby`, or announced with
  `role="alert"`.
- Toggles use `aria-pressed`, tabs `aria-current` or `aria-selected`, disclosures `aria-expanded`.
- Drag and drop always has a button alternative (the DJ queue has Move up / Move down), per WCAG
  2.5.7.

**Dialogs**

- Modal dialogs are a `div role="dialog" aria-modal="true" aria-labelledby` (never on a `<form>`)
  and call `useModalDialog(ref, onClose, initialFocus)` from `src/lib/a11y/useModalDialog.ts`: focus
  moves in, Tab wraps inside, Escape closes, focus returns to the opener.
- Non-modal popovers (the DJ table card) use `role="dialog"` without `aria-modal`, close on Escape
  and leave focus where it was.

**Live updates**

- Status that changes without a click (place in line, now singing, import progress) is in a
  `role="status"` region; failures use `role="alert"`. Announce the change, not the whole list.
- Realtime refreshes must not move focus or reset scroll.

**Colour and motion**

- Use the tokens in `globals.css`. Checked pairs: `text`, `muted`, `faint`, `brand`, `brand-2`,
  `accent`, `success`, `warning`, `danger` as text on `bg`, `surface`, `surface-2`; white text
  only on `brand-fill` and `brand-2-fill` (the bright `brand`/`brand-2` give white 3.1:1).
- Status never relies on colour alone: pair it with text or an icon with a label.
- The focus ring is the global `:focus-visible` outline. Do not remove it without a replacement.
- `prefers-reduced-motion` turns animations off globally; do not add motion that carries meaning.

**Zoom and reflow**

- Never set `maximumScale` or `user-scalable=no`. Layouts work at 320 CSS px wide (= 1280 px at
  400% zoom) without sideways scrolling; grids use `minmax(0, 1fr)` so long titles wrap.

## Accessibility menu

The footer of every page has an **Accessibility** button (`src/components/a11y/AccessibilityMenu.tsx`)
that opens a modal sheet with:

- **Text size**: normal, large (119%) or larger (137.5%). Every size in the app is in `rem`, so
  scaling the root font size scales the whole page; layouts must still reflow at 320 px.
- **High contrast**: overrides `muted`, `faint`, the borders and surfaces (AAA 7:1 for secondary
  text, 3:1 for field borders; checked in `contrast.test.ts`) and drops the background glow.
- **Stop animations**: the same as the OS "reduce motion", for this app only.
- **Underline links**.

Settings apply at once as `data-a11y-*` attributes on `<html>` and are stored in this browser
only, in `localStorage` under `kj.a11y` (`src/lib/a11y/preferences.ts`). They are strictly
functional, never sent to the server, and must be listed in the storage register of
`docs/PRIVACY.md` (ADR-012). A small inline script in the root layout applies them before first
paint so the page does not jump. The OS's own text size, zoom and reduced-motion settings keep
working without the menu. No third-party overlay (ADR-013).

## Accessibility statement

`/[locale]/accessibility` (`src/app/[locale]/accessibility/page.tsx`) states the standard, what
was done, the menu, known limitations and the accessibility contact, in Hebrew and English. The
contact comes from the deployment's environment: `A11Y_CONTACT_NAME`, `A11Y_CONTACT_EMAIL`,
`A11Y_CONTACT_PHONE` (`.env.example`, read at build time by `src/lib/a11y/contact.ts`). Until an
email or phone is set, the page says the details are being published. Update `STATEMENT_UPDATED`
in `contact.ts` and the statement copy whenever the known limitations change.

## Manual checks before a release

Automated tools find about a third of real problems. Before each minor release, and for any new
flow, walk it:

1. **VoiceOver on iPhone, Hebrew**: join a table, find a song, request it, hear your place in
   line change. Then TalkBack on Android in English.
2. **Keyboard only** on a laptop: the DJ console end to end (approve, reorder, start, done) and the
   admin tables page.
3. **200% browser zoom** and **iOS Larger Text** at the largest size on the guest pages.
4. **Bright light, dim screen**: the guest page outdoors or under bar lights.

Record findings as GitHub issues labelled `accessibility`.

## Known gaps

Ordered by impact; the `accessibility` agent keeps this list current.

1. **Accessibility contact not set**: production needs `A11Y_CONTACT_*` set (regulation 35)
   before the statement is complete.
2. **Input boundaries**: `border-strong` on `surface-2` is 1.5:1, below the 3:1 WCAG 1.4.11 asks
   for component boundaries (the high-contrast setting fixes it, the default theme does not).
   Labels sit above every field, which helps, but the default border should be raised.
3. **Signed-in screens with real data** are scanned only in demo mode; a staging scan with a
   signed-in owner is not automated yet.
4. **Queue announcements**: no automated test that VoiceOver announces a place-in-line change.
5. `window.confirm` for cancel and regenerate-code: accessible, but unstyled and in the browser's
   language rather than the page's.
6. The YouTube player's captions and controls are YouTube's; we cannot test them.
