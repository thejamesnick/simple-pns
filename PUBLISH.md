# Publishing SimplePNS

Step-by-step guide to push to GitHub and publish to npm.

---

## Prerequisites

- [ ] GitHub account with repo `thejamesnick/pns` created (empty, no README)
- [ ] npm account (`npm whoami` to verify)
- [ ] You're logged into npm (`npm login`)

---

## 1. Push to GitHub

```bash
# From the project root
cd PNS

git init
git add .
git commit -m "Initial release: PNS v1.0.0"

git remote add origin git@github.com:thejamesnick/pns.git
git push -u origin main
```

> **Note:** The `.env` file is in `.gitignore` so it won't be committed.
> Generate fresh VAPID keys after cloning.

---

## 2. Create a GitHub Release

1. Go to `https://github.com/thejamesnick/pns/releases/new`
2. Tag: `v1.0.0`
3. Title: `v1.0.0 — Push Notification System`
4. Description: Copy from [`CHANGELOG.md`](./CHANGELOG.md#100--2026-06-30)
5. Attach the built `dist/` folder (optional)
6. Publish release

---

## 3. Publish to npm

```bash
# Make sure you're logged in
npm whoami   # Should show "thejamesnick"

# Dry run first — checks for errors without publishing
npm publish --dry-run

# Check the output — verify:
#   - package name: pns
#   - version: 1.0.0
#   - files included: dist/, bin/, README.md, LICENSE

# Actually publish
npm publish
```

### If the name "pns" is taken on npm

If `npm publish` fails because `pns` is already taken, you have two options:

**Option A:** Use a scoped package (requires no name conflict):
```bash
# In package.json, change "name": "pns" to "name": "@thejamesnick/pns"
# Then publish as a scoped package (public by default)
npm publish --access public
```

**Option B:** Choose a different name like `pns-push` or `solid-pns`.

---

## 4. Verify Installation

```bash
# In a new directory
mkdir pns-test && cd pns-test
npm init -y
npm install simple-pns

# Check the exports work
node -e "
  const SimplePNS = require('simple-pns');
    console.log('Server SDK:', typeof SimplePNS.PushNotificationServer);
"
```

---

## 5. Post-Publish Checklist

- [ ] README badges are live (CI, npm version)
- [ ] GitHub Actions CI runs on push
- [ ] `npm install pns` works
- [ ] CHANGELOG is up to date
- [ ] Tag and release created on GitHub
