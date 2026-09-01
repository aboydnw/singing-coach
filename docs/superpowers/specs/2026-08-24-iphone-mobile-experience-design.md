# iPhone mobile experience design

## Objective

Make Singing Coach feel intentional when installed from Safari on an iPhone while preserving the
existing Next.js application, routes, desktop layouts, visual identity, and practice model. This
pass covers the installable web-app shell, mobile navigation, mobile practice hierarchy, and
reliable reference-tone playback.

The approved visual direction is a focused but familiar mobile application: conventional pages,
a compact top bar, persistent bottom navigation, and progressive disclosure within the existing
practice flow. It does not turn practice into a full-screen wizard.

## Confirmed playback problem

The current `playSequence` implementation creates an `AudioContext`, calls `resume()` without
awaiting or checking it, schedules oscillator nodes, and reports playback as active regardless of
the context state. Recording succeeds because microphone capture uses `MediaRecorder`, which is a
separate browser subsystem.

On the installed iPhone experience, reference playback is silent from the first attempt. WebKit
also has open reports of Web Audio contexts remaining silent or failing to resume in Home Screen
web apps. The design therefore does not depend on `AudioContext` for reference playback.

## Scope

### Included

- Installable web-app metadata and assets
- Standalone display mode and iPhone safe-area handling
- Compact mobile top bar
- Persistent mobile bottom navigation for Practice, Calibrate, Progress, and Account
- Mobile hierarchy refinements for Practice home and an active practice
- Reference sequence synthesis as an in-memory WAV
- Reference playback through an HTML media element
- Explicit playback loading, playing, stopping, completion, error, and retry states
- Automated coverage and a physical-iPhone acceptance pass

### Excluded

- Native App Store packaging
- A full-screen practice wizard
- A fixed post-attempt action dock
- Redesigning charts, scorecards, calibration, progress, sign-in, or account management beyond
  spacing needed by the mobile shell
- Changing audio analysis, recording encoding, coaching, exercise generation, or persistence
- Changing the desktop practice information architecture

## Mobile application shell

The application supplies a web manifest with the product name, short name, standalone display
mode, start URL, theme color, background color, and app icons. Next.js metadata supplies the Apple
touch icon, matching theme information, and an iPhone viewport configured with `viewport-fit=cover`.

The root shell respects `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` where relevant.
No page content, action, or navigation label may sit behind the status area or Home indicator.

On narrow screens, the current wrapping header is replaced by:

- a compact sticky top bar containing product identity or the current screen title; and
- a fixed bottom navigation containing Practice, Calibrate, Progress, and Account.

Each navigation item has an icon and short text label, an explicit accessible label, a touch target
of at least 44 by 44 CSS pixels, and an active state that does not rely on color alone. The content
area reserves enough bottom padding for both the bar and the safe-area inset. The desktop header
and navigation remain unchanged at the existing desktop breakpoint.

## Practice hierarchy

### Practice home

Practice remains the default destination. The existing warm cream, coral, and teal direction is
retained. On mobile, the primary practice action appears earlier in the viewport. Returning users
see Continue Practice or Start Practice before the full editorial introduction. Coach-recommended
direction remains the default; alternatives stay available without becoming equally prominent.

### Active practice

An active practice remains a conventional page rather than a wizard. Its mobile reading order is:

1. compact practice identity and status;
2. current exercise proposal or selected attempt;
3. the primary contextual action, including Hear Reference or Start Exercise;
4. recording controls after explicit exercise acceptance;
5. concise coaching result and Try Again;
6. conversation and optional full analysis;
7. attempt navigation and Practice Compass as supporting context.

The current exercise must be discoverable without searching through history or supporting
orientation. Full acoustic analysis remains collapsed by default. Attempt navigation stays compact
on mobile, and the Practice Compass remains in normal flow below the current work. Desktop retains
its timeline, content, and sticky Compass columns.

## Reference playback architecture

Reference playback uses the same MIDI notes and duration-per-note values produced by exercise
generation. A pure synthesis function converts them into a mono PCM WAV blob in memory. The
waveform retains the current sine tone, amplitude, short attack, and short release so playback does
not click at note boundaries.

An HTML audio element plays the object URL created from that blob. Playback begins only in direct
response to a user action and never autoplays. The player owns the object URL and revokes it when
playback finishes, is stopped, is replaced, or the component unmounts.

Reference playback exposes a small controller contract:

- `done`: resolves when playback finishes or is intentionally stopped;
- `stop`: pauses playback, resets it, and releases resources;
- playback errors reject with a user-presentable failure rather than being swallowed.

Starting a new reference stops the previous one. Starting microphone recording also stops reference
playback so the exercise tone cannot leak into the singer's take. Navigation or component teardown
stops playback and releases resources.

Web Audio is not the primary or silent fallback path. This avoids presenting success when an iPhone
audio context never becomes audible.

## Playback interaction states

The Hear Reference control has these visible states:

1. **Ready:** `Hear reference` with a play affordance.
2. **Loading:** disabled duplicate activation and `Preparing sound…`.
3. **Playing:** `Stop reference` and a concise live status.
4. **Finished:** returns to Ready without an unnecessary success message.
5. **Error:** an inline notice says `Reference sound couldn’t play` and offers Retry.

The control never reports Playing merely because synthesis or scheduling began. It enters Playing
only after the media element's `play()` promise resolves. Errors include enough internal detail for
diagnosis but user-facing text remains concise.

## Accessibility and interaction requirements

- Playback status uses a polite status announcement and does not announce timers or repeated
  progress updates.
- Audio never begins automatically.
- Active navigation includes a non-color indicator and `aria-current`.
- All controls preserve visible focus treatment.
- Bottom navigation and page content work with increased text size and do not require horizontal
  scrolling.
- Motion is nonessential and respects reduced-motion preferences.
- Keyboard appearance must not leave the active input or submit control hidden behind bottom
  navigation.

## Error handling

- WAV synthesis failures and media playback failures surface through the same playback error state.
- Retry creates a fresh media element and object URL.
- A failed reference does not disable recording or the rest of practice.
- Unsupported media APIs produce a direct compatibility message rather than a silent no-op.
- Existing recording, upload, analysis, coaching, partial-save, and retry behavior remains
  authoritative and unchanged.

## Testing

### Automated

- MIDI-to-frequency behavior remains pinned.
- WAV tests verify header validity, sample rate, channel count, duration, note ordering, and
  non-clicking amplitude envelopes.
- Playback controller tests cover play success, completion, stop, rejected `play()`, replacement,
  and cleanup.
- UI tests cover Ready, Loading, Playing, Error, Retry, and stopping playback before recording.
- Shell tests cover active mobile navigation and route matching.
- Metadata checks cover the manifest, icons, standalone display mode, theme/background colors, and
  viewport configuration.
- Existing unit tests, formatting check, design-value check, production build, and Storybook build
  remain green.

### Physical iPhone acceptance

1. Remove the old Home Screen shortcut and install the updated site again.
2. Launch from the Home Screen and confirm it opens without browser chrome.
3. Confirm top and bottom content clears the safe areas.
4. Play a reference on first launch.
5. Stop and replay it.
6. Background and reopen the app, then play it again.
7. Start a reference and then record; confirm playback stops before capture.
8. Complete one take through upload, analysis, coaching, and retry.
9. Visit every bottom-navigation destination and confirm its active state.
10. Open the keyboard in the coach composer and confirm the input and send action remain reachable.
11. Rotate once and return to portrait without obscured or horizontally scrolling content.

## Source-of-truth boundaries

- `lib/theme.ts` remains authoritative for product-interface foundations.
- Shared shell/navigation components own safe areas, active-state behavior, and touch targets.
- Reference WAV synthesis is a pure library concern; media lifecycle belongs to the playback
  controller or component.
- Feature pages own their local composition and must not recreate shell safe-area padding.
- `docs/design/` remains authoritative for established design-system contracts; this specification
  governs the scoped mobile change until those documents are updated during implementation.
