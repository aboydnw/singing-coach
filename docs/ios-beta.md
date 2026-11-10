# iOS TestFlight beta

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
   Expo account/project, and signing ownership. None is provisioned by this branch.
   Set `IOS_BUNDLE_IDENTIFIER` and `EAS_PROJECT_ID` only to confirmed existing IDs.
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
