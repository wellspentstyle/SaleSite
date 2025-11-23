# Email Automation Testing - Quick Start Guide

## ✅ What's Been Integrated

Your email extraction webhook now has comprehensive testing and debugging tools:

1. **10-Scenario Test Suite** - Validates email parsing with expected vs actual results
2. **Real-Time Monitor** - Dashboard showing sales stats and recent emails
3. **System Diagnostics** - Health checker for all components
4. **Rejection Analyzer** - Debug tool to understand why specific emails fail

## 🚀 Quick Start

### Step 1: Run Diagnostics (First Time Setup)

```bash
node tools/diagnostics.js
```

This checks:
- ✅ Environment variables (ADMIN_PASSWORD, CLOUDMAIL_SECRET, OpenAI API)
- ✅ Server connectivity
- ✅ Airtable access
- ✅ Webhook endpoint security

**Expected Result:** All green checkmarks ✅

---

### Step 2: Run Test Suite

```bash
node tools/test-email-extraction.js
```

Tests 10 email scenarios:
- ✅ Valid flash sales (should pass)
- ✅ Valid seasonal sales (should pass)
- ❌ Welcome emails (should fail)
- ❌ Newsletters (should fail)
- ❌ Account verification (should fail)

**Expected Result:** 10/10 tests passing, 100% success rate

---

### Step 3: Monitor Live Processing (Optional)

```bash
node tools/email-monitor.js
```

Real-time dashboard showing:
- Total sales count
- Live vs pending sales
- Average confidence scores
- Last 5 added sales

Press **R** to refresh, **Q** to quit.

---

## 🔍 Debugging a Failed Email

If a real email gets rejected and you want to know why:

### Option 1: From a file
```bash
echo "From: sales@brand.com
Subject: Weekend Sale

Email content here..." > test-email.txt

node tools/analyze-rejection.js test-email.txt
```

### Option 2: From clipboard
```bash
pbpaste | node tools/analyze-rejection.js
```

**Output Shows:**
- ❌ Why it was rejected
- 🤖 AI reasoning
- 💡 Recommendations to improve

---

## 📊 Understanding Test Results

### Test Output Example:
```
✅ Valid Flash Sale - Clear Details
   Expected: PASS | Actual: PASS ✓
   Company: J.Crew
   Discount: 40%
   Confidence: 95%
   Reasoning: Clear flash sale with explicit dates and terms
```

### Confidence Scoring:
- **90-100%**: Excellent - very clear promotional sale
- **75-89%**: Good - clear sale, missing some details
- **60-74%**: Acceptable - likely a sale but ambiguous
- **<60%**: Rejected - likely welcome email or unclear

---

## ⚙️ Adjusting the Confidence Threshold

The webhook currently uses **60%** confidence threshold. To adjust:

1. Open `server/webhook.js`
2. Find: `const confidenceThreshold = 60;` (around line 3015)
3. Adjust as needed:
   - Lower (50-55%) = More permissive, may accept borderline emails
   - Higher (70-75%) = More strict, may reject valid sales

**Recommendation:** Keep at 60% for balanced accuracy.

---

## 🐛 Common Issues

### "Connection refused" error
**Solution:** Make sure backend is running:
```bash
# Check if server is up
curl http://localhost:3001/health
```

### "Unauthorized" webhook error
**Solution:** Check CLOUDMAIL_SECRET matches your CloudMailin config:
```bash
echo $CLOUDMAIL_SECRET
```

### Tests pass but real emails fail
**Solution:** Use the rejection analyzer:
```bash
node tools/analyze-rejection.js <email-file>
```

---

## 📈 Key Improvements

Your webhook now has:

✅ **Better HTML parsing** - Strips styles/scripts, handles entities  
✅ **Fuzzy duplicate detection** - Handles "Gap" vs "GAP Inc."  
✅ **Lower rejection rate** - 60% threshold vs 70%  
✅ **AI reasoning visibility** - See why emails pass/fail  
✅ **Company auto-linking** - Automatically creates/links Company records  

---

## 🎯 Next Steps

1. ✅ Run diagnostics to verify setup
2. ✅ Run test suite to validate webhook
3. ✅ Forward a real sale email to test live
4. 📊 Monitor with email-monitor.js for a few days
5. 🔧 Use analyze-rejection.js to debug any issues

---

**Need Help?** Check the full documentation in `tools/README.md`
