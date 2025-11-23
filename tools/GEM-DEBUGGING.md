# Gem Scraper Debugging Guide

## ✅ Diagnostic Mode Active

Your Gem scraper is now running in **diagnostic mode** with comprehensive logging to help us debug the authentication issue.

---

## 🔍 What to Look For

When you run a Gem sync from the admin panel, check the backend logs for this section:

```
📊 PAGE ANALYSIS:
   URL: https://gem.app/emailLogIn?...
   Title: Email Log In
   Has "Logged In" text: true/false
   Has "Continue" text: true/false
   Has "Email Log In" text: true/false
   Buttons found: 3
   Button details:
      1. "Continue" (visible: true)
      2. "×" (visible: true)
      3. "OK" (visible: false)
   Body text preview: ...
```

This tells us **exactly** what's on the page after clicking the magic link.

---

## 📸 Screenshots Generated

The diagnostic scraper saves screenshots at each step:

1. **`/tmp/gem-1-initial.png`** - Right after clicking magic link
2. **`/tmp/gem-2-after-popup.png`** - After trying to dismiss popup
3. **`/tmp/gem-error-state.png`** - If authentication fails

### How to Access Screenshots:

```bash
# List all Gem screenshots
ls -la /tmp/gem-*.png

# View the most recent error state (if using Replit shell)
# Screenshots expire when the server restarts
```

---

## 🐛 Debugging Steps

### Step 1: Run a Gem Sync

1. Go to admin panel → Gem sync
2. Click "Request Login Email"
3. Wait for the magic link email
4. Click "Sync Gem Items"

### Step 2: Check the Logs

Look for the **PAGE ANALYSIS** section in your backend logs. Share these details:

```
- Has "Logged In" text: ???
- Has "Continue" text: ???
- Buttons found: ???
```

### Step 3: Check the URL

After clicking the magic link, what URL does it land on?

- ✅ **Good:** `https://gem.app/items` or `https://gem.app/shop`
- ❌ **Bad:** `https://gem.app/emailLogIn?token=...` (stuck on login page)

---

## 🎯 Common Issues & Fixes

### Issue 1: No "Continue" Button Found

**Logs show:**
```
Has "Continue" text: false
Buttons found: 1
   1. "×" (visible: true)
```

**This means:** The popup might use different text like "OK", "Got It", or "Close"

**Fix:** Check the button text in the logs and let me know what it says.

---

### Issue 2: Button Exists But Click Doesn't Work

**Logs show:**
```
Has "Continue" text: true
Buttons found: 2
   1. "Continue" (visible: true)
✅ Clicking "Continue" button...
✅ Clicked successfully
❌ Authentication failed after 15s
```

**This means:** The button click triggers but doesn't actually log in

**Possible causes:**
- JavaScript error on the page
- Button is disabled
- Gem changed their authentication flow

**Fix:** Share the screenshots so we can see what's happening visually.

---

### Issue 3: Magic Link Expires Too Fast

**Logs show:**
```
Response status: 200
URL after navigation: https://gem.app/emailLogIn?expired=true
```

**This means:** The magic link expired before we could use it

**Fix:** The scraper might be taking too long. We can speed up the process.

---

## 📋 What to Share for Debugging

When reporting the issue, please share:

1. **The PAGE ANALYSIS section** from logs
2. **The final URL** it lands on
3. **Button details** (what buttons were found)
4. **Screenshots** if you can access `/tmp/gem-*.png`

Example of what to share:

```
📊 PAGE ANALYSIS:
   URL: https://gem.app/emailLogIn?token=xyz
   Has "Continue" text: true
   Buttons found: 2
      1. "Continue" (visible: true)
      2. "×" (visible: true)

Final URL: https://gem.app/emailLogIn?token=xyz
Error: Authentication failed after 15s
```

---

## 🚀 Next Steps

Once we see the diagnostic logs, we can:

1. **Update the button selector** if it's using different text
2. **Add a delay** if the magic link is expiring too fast
3. **Try a different approach** if Gem is blocking automation

The diagnostic mode gives us all the information we need to fix this! 🎯
