# iOS TestFlight beta

## Confirmed release identity

- App Store Connect name: **Voice Up: Singing Coach**.
- iPhone home-screen label: **Voice Up**, explicitly set independently of the store name.
  Actual label rendering still needs a real-device check.
- iOS bundle identifier: `com.anthonynboyd.singingcoach` (owner-approved November 17, 2026).
- The app configuration uses this identifier by default; `IOS_BUNDLE_IDENTIFIER` remains
  available for explicitly isolated build checks; the EAS `beta` profile rejects a
  conflicting override.
- This does not establish App Store Connect registration, provisioning, a signed build,
  or TestFlight availability. Those release gates still require verification below.

## First implementation milestone

The native app lives in `mobile/` and reuses the existing Supabase/Vercel backend.
It is deliberately a first practice-loop beta, not parity with the whole website.
The backend, DSP, curated technique, database schema, and web navigation remain unchanged.

The app must support sign-in, active-practice recovery, a calibrated pitch guide,
record/stop/listen/discard/send, durable processing recovery, feedback and history.
Without saved calibration, use free singing and offer the existing web calibration
screen rather than guessing a safe target range. Reference tones are labeled a
pitch guide, never a vocal example.

The warm native palette mirrors the semantic roles in `lib/theme.ts`. Native
controls replace Chakra components. Practice controls come before history;
feedback is opened separately and canonical cautions must remain visible.

## Release gates, not completed work

Do not run paid builds, create signing credentials, enroll an Apple account, deploy
the backend, or invite testers without the owner's approval.

1. Confirm Apple Developer membership, team, bundle identifier, App Store Connect app,
   Expo account/project (if using EAS), and signing ownership. The confirmed bundle
   identifier above is configured in source, but Apple resources are not provisioned by
   this branch.
   Leave `IOS_BUNDLE_IDENTIFIER` unset for release builds, including local Xcode
   archives. Set `EAS_PROJECT_ID` only to a confirmed existing project ID when using
   EAS. The `beta` profile rejects an alternate bundle identifier; other profiles may
   use an explicit override only for isolated build checks.
   The EAS beta profile uses **local credentials** so it cannot silently generate new
   distribution credentials. Provide approved local credentials through EAS's
   documented credentials.json workflow. Do not commit them.
2. Set an approved HTTPS API base, matching Supabase public URL/key and OAuth callback
   allowlist. Never put service-role, job-signing or OpenRouter secrets in EXPO_PUBLIC.
   Existing email/password users can sign in without new OAuth credentials. Google
   uses the system browser and PKCE; test cancellation, callback validation, cold
   launch, session expiry and account switching in a development build.
3. Decide and configure the App Store-compliant identity options before external
   distribution. Sign in with Apple is **not implemented** by this first beta.
   Google-only social sign-in must not be treated as App Review-ready.
4. Confirm backend migrations, durable Workflow routes/signing configuration, ownership
   checks and approved test data. Observe a real authenticated upload-to-coaching loop.
   Client unit tests do not establish live RLS or backend health.
5. Complete physical-iPhone audio and recovery checks below. Confirm current Apple
   Xcode/iOS SDK upload requirements at build time. Do not use a JavaScript export as
   proof of an iOS archive or TestFlight acceptance.
6. Add reviewed 1024px app icon, app/support/privacy URLs, App Privacy declarations
   (recordings, identifiers, practice data and processors), privacy-manifest review,
   age rating, export compliance, review instructions/access and beta description.
   The in-app send disclosure identifies Supabase, Vercel and OpenRouter and asks
   before transmission; legal/privacy review still belongs to the release owner.
7. Replace the explicit App Store Connect placeholder in `eas.json`, assign a new
   build number, and obtain owner approval for the exact build/upload. Only then run
   the store build and submit commands using approved existing credentials.
8. Record the build ID, commit, App Store Connect processing result and tester access.
   Create an internal testing group before an external group, and follow Beta App Review.
   Internal-only builds cannot be distributed externally. Recruit or invite testers only
   after specific authorization.

## Device acceptance matrix

Record iPhone/iOS, app build, microphone/route, backend environment and observed
outcome. No row is passed merely because its unit test or bundle passes.

- Fresh launch, missing config, sign-in error, canceled Google auth, token refresh,
  sign-out, account switch, and existing history restored.
- Microphone denied/revoked, delayed prompt/cancel, repeated Record and Stop taps,
  discard during capture and review, re-record, and zero upload before Send.
- Inspect actual PCM WAV header, channels/sample rate/duration and compare a known
  fixture against the existing analysis measurements. Native microphone processing
  and route changes may alter data; do not claim measurement parity before this.
- Pitch-guide playback, replay, volume/silent mode, speaker and Bluetooth/headphones,
  playback stopped before capture, take playback after Stop.
- Lock/background, incoming call/Siri, route unplug/switch, interruption during
  preparation/capture/stop/review; no hung microphone and clear recovery.
- Offline start, offline Send, timeout after upload, timeout after server creates the
  job, foreground restore, app kill/relaunch, retry and abandon, no duplicate attempt.
- Failed coaching with saved analysis, successful feedback/cautions, ended practice
  read-only, explicit end confirmation, native back/navigation while a take is local.
- Two separate approved test accounts with private history/storage; deletion flow
  removes recordings and data with explicit irreversible confirmation.
- VoiceOver announcements/focus, largest Dynamic Type, narrow iPhone, keyboard and
  switch controls, readable long coaching text, 44pt+ tap targets.

## Google sign-in beta (build 2)

Build 1 compiled Google off. The opt-in `beta-google` EAS profile enables the
existing browser-based Supabase Google provider, not a new Google client secret.
For a local archive, set `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true` in ignored
`mobile/.env.local` before bundling. Both beta profiles enforce the approved bundle
identifier. Default builds still leave Google off.

Before distributing this build, verify **Authentication → URL Configuration →
Redirect URLs** in the existing Supabase project contains exactly
`singingcoach://auth/callback`. Do not replace the website's URLs or add a wildcard.
The Google provider must already be enabled with the existing Supabase HTTPS
provider callback. The native callback belongs in Supabase's allowlist, not as a
Google Console HTTPS redirect. A public provider-enabled check does not prove the
native redirect is allowed. No live auth settings are changed by this PR.

Use the same Google account as on the website. Supabase performs identity linking
for eligible matching verified email identities; the client does not copy history
or merge accounts. A different Google address can create a separate account under
the project's existing signup policy. Check existing history after signing in.

The app stores the PKCE verifier in device Keychain through Supabase, accepts only
an exact code callback, recovers cold-launch callbacks, deduplicates callback
notifications, and allows another try after cancel/error. It never imports tokens
from callback fragments. Pending flows expire after ten minutes; restart Google
sign-in after an interrupted/expired flow.

Physical-iPhone acceptance still required: complete Google login, restore the same
history, cancel and retry, select a different account, background/return, cold
launch, expired code, sign out/relaunch. Unit tests and a JS export are not proof
of these outcomes. Keep this an internal beta; do not invite external testers or
submit publicly until identity and other release gates are satisfied.

Apple guideline 4.8 requires an equivalent privacy-preserving login option for
apps using Google as primary login unless an exception applies. Email/password
alone is not that option. Sign in with Apple is a likely follow-up, not implemented
here; do not describe Google-only beta access as App Review-ready.

References:
- https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/auth/auth-identity-linking
- https://developer.apple.com/app-store/review/guidelines/#login-services
