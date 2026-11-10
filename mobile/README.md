# Singing Coach iOS beta

An Expo/React Native client for the existing Singing Coach backend. This is an
implementation milestone, **not a signed or distributed TestFlight build**.

## Run locally

Use Node 22+ and the repository's pinned Yarn version.

```sh
cd mobile
corepack yarn install --immutable
cp .env.example .env
# Set your approved backend's PUBLIC configuration in .env.
corepack yarn start
```

A development build is the authoritative native-auth/audio target; Expo Go is not
evidence that a TestFlight build works. Xcode and an iOS Simulator are needed for
`yarn ios`; audio acceptance requires a physical iPhone. Do not test using another
person's account or recording. No production URL or credential is embedded.

## Verification

```sh
corepack yarn verify
corepack yarn expo install --check
corepack yarn export:ios
cd .. && corepack yarn verify
```

These checks exercise code and bundling, not device audio, signing, account setup,
RLS in a live project, backend availability, or distribution. See
[the release checklist](../docs/ios-beta.md) for release gates.

## Boundaries

- This package is intentionally separate from the Next.js dependency graph and lockfile.
- Shared pure schemas, exercise generation and pitch-guide synthesis are reused.
  Chakra, browser audio, and browser authentication are not bundled.
- Native recording uses a local PCM WAV. Stop does not send. Unsent takes are temporary
  and can be lost if the app is terminated; Discard removes the local take.
- Stay in the app until the server acknowledges the recording. This beta does not
  promise background upload or locked-screen recording.
- Server jobs can be resumed after acknowledgement. Retry preserves the original
  take/job identity. Existing history remains account-scoped.
- Calibration, charts, and attempt conversations remain available in the web app;
  they are not represented as fully native features in this first beta.
- No analytics, push notifications, purchases, or over-the-air updates are introduced.
