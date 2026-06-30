# Contributing to SimplePNS

Thanks for wanting to contribute! Here's how to get started.

## Setup

```bash
git clone https://github.com/thejamesnick/pns.git
cd pns
npm install
```

## Development

```bash
# Build both server and client
npm run build

# Generate VAPID keys for the demo
npm run generate-keys
# Copy keys into demo/.env

# Start the demo server
npm run demo
```

## Project Structure

```
src/
  server/     # Node.js Server SDK
  client/     # Browser Client SDK
  sw/         # Service Worker (TypeScript)
  types.ts    # Shared interfaces
demo/         # Express + browser test rig
bin/          # Utility scripts
```

## Pull Request Checklist

- [ ] Code compiles (`npm run build`)
- [ ] No new TypeScript errors
- [ ] Demo still works end-to-end
- [ ] README updated if API surface changed
- [ ] Changes follow the existing code style (strict TypeScript, JSDoc on public APIs)

## Design Principles

1. **No framework lock-in** — Server SDK should work with Express, Fastify, or raw Node.
2. **Fail gracefully** — Return `{ success, error }` objects, don't throw.
3. **Dead subscription hygiene** — Always surface 410/404 so consumers can clean their DB.
4. **Type everything** — No `any` in public APIs.

## Questions?

Open a [Discussion](https://github.com/thejamesnick/pns/discussions) or tag your issue with `question`.
