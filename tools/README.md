# Email Extraction Testing & Debugging Tools

This suite of tools helps you test, monitor, and debug the email extraction webhook for sale automation.

## 📦 Files Included

1. **test-email-extraction.js** - Automated test suite with 10 email scenarios
2. **email-monitor.js** - Real-time monitoring dashboard
3. **analyze-rejection.js** - Debug tool for understanding why emails are rejected
4. **diagnostics.js** - System health checker

## 🚀 Quick Start

### 1. Run System Diagnostics

Check that all components are properly configured:

```bash
node tools/diagnostics.js
```

This will verify:
- Environment variables (API keys, secrets)
- Server connectivity
- AI API access
- Airtable connection
- Webhook endpoint security

### 2. Run the Test Suite

Test the webhook with 10 different email scenarios:

```bash
node tools/test-email-extraction.js
```

Expected output: 10/10 tests passing with 100% success rate.

### 3. Monitor Email Processing (Optional)

Watch email processing in real-time:

```bash
node tools/email-monitor.js
```

Press `R` to refresh manually, `Q` to quit.

## 🔧 Individual Tools

### Diagnostics

**Purpose:** Verify system health before running tests

```bash
node tools/diagnostics.js
```

**Checks:**
- ✅ ADMIN_PASSWORD set
- ✅ CLOUDMAIL_SECRET configured
- ✅ OpenAI API accessible
- ✅ Airtable connected
- ✅ Webhook endpoint secure

**Exit Codes:**
- 0 = All checks passed
- 1 = One or more checks failed

---

### Test Suite

**Purpose:** Validate webhook handler with realistic email scenarios

```bash
node tools/test-email-extraction.js
```

**Test Cases:**
1. Valid Flash Sale (40% off with code)
2. Valid Seasonal Sale (with end date)
3. Valid HTML Email (no plain text)
4. Invalid Welcome Email (should reject)
5. Invalid Newsletter (should reject)
6. Invalid Account Verification (should reject)
7. Valid Clearance Sale (range discount)
8. Borderline Referral (should reject)
9. Valid Black Friday Sale
10. Edge Case Forwarded Email

**Output:**
```
✅ Valid Flash Sale - Clear Details
   Expected: PASS | Actual: PASS ✓
   Company: J.Crew
   Discount: 40%
   Confidence: 95%
   Reasoning: Clear flash sale with explicit dates and terms
```

---

### Email Rejection Analyzer

**Purpose:** Debug why specific emails are rejected

```bash
# From a file
node tools/analyze-rejection.js email-sample.txt

# From stdin
cat email.txt | node tools/analyze-rejection.js
```

**Email File Format:**
```
From: sales@brand.com
Subject: Weekend Sale - 30% Off

Email body content goes here...
```

**Output:**
- Email metadata (from, subject, body length)
- AI analysis (extracted data, confidence score)
- Reasoning (why accepted/rejected)
- Recommendations (how to improve)

---

### Email Monitor

**Purpose:** Real-time dashboard showing live email processing stats

```bash
node tools/email-monitor.js
```

**Features:**
- Total sales count
- Live vs pending sales
- Average confidence scores
- Last 5 added sales
- Auto-refresh every 30s

**Controls:**
- Press `R` to refresh manually
- Press `Q` to quit

## 📊 Understanding Results

### Confidence Scores

- **90-100%**: Excellent - very clear promotional sale
- **75-89%**: Good - clear sale, minor details missing
- **60-74%**: Acceptable - likely sale but review manually
- **<60%**: Rejected - questionable or not a sale

### Test Success Rate

- **100%**: Perfect - all tests passing as expected
- **90%+**: Good - minor issues to investigate
- **<90%**: Issues - review failures and adjust webhook

## 🐛 Common Issues

### "Connection refused"

**Problem:** Server not running

**Solution:**
```bash
# Make sure backend is running
npm run dev
```

### "Unauthorized" errors

**Problem:** CLOUDMAIL_SECRET mismatch

**Solution:**
```bash
# Check your secret matches CloudMailin config
echo $CLOUDMAIL_SECRET
```

### Low confidence scores

**Problem:** Email content unclear

**Checklist:**
- ✅ Clear sale dates ("Valid until Nov 25")
- ✅ Explicit discount ("30% off" not "up to 30%")
- ✅ Sale-specific URLs (links to /sale pages)
- ❌ Avoid welcome/signup language

### AI parsing errors

**Problem:** OpenAI API not accessible

**Solution:**
```bash
# Test API directly
curl -X POST "$AI_INTEGRATIONS_OPENAI_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $AI_INTEGRATIONS_OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}]}'
```

## 📝 Sample Test Emails

Create these files for manual testing:

**valid-flash-sale.txt:**
```
From: sales@brand.com
Subject: 48-Hour Flash Sale - 40% Off

Don't miss our biggest sale!
40% off everything with code FLASH40
Valid through Sunday only!

Shop now: https://brand.com/sale
```

**invalid-welcome.txt:**
```
From: welcome@brand.com
Subject: Welcome! Here's 15% Off

Thanks for signing up!
Enjoy 15% off your first order.
Code: WELCOME15

Start shopping: https://brand.com
```

Then test:
```bash
node tools/analyze-rejection.js valid-flash-sale.txt
node tools/analyze-rejection.js invalid-welcome.txt
```

## 🔄 Workflow

### Daily Monitoring (Recommended)
1. **Morning:** Run `diagnostics.js` to check system health
2. **Throughout day:** Keep `email-monitor.js` running in background
3. **As needed:** Use `analyze-rejection.js` for rejected emails

### Before Deploying Changes
1. Run `diagnostics.js` to verify configuration
2. Run `test-email-extraction.js` to validate webhook
3. Fix any failures before deploying

### Debugging Rejected Emails
1. Copy email content to a file (e.g., `rejected-email.txt`)
2. Run `node tools/analyze-rejection.js rejected-email.txt`
3. Review AI reasoning and recommendations
4. Adjust email format or webhook logic as needed

## 🎯 Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| Test Success Rate | 100% | ✅ |
| Avg Confidence | >75% | ✅ |
| False Positives | <5% | ✅ |
| False Negatives | <10% | ✅ |

## 📞 Troubleshooting

If you encounter issues:

1. **Run diagnostics first:**
   ```bash
   node tools/diagnostics.js
   ```

2. **Check backend logs:**
   ```bash
   # In Replit console, check backend workflow logs
   ```

3. **Test with known-good email:**
   ```bash
   node tools/analyze-rejection.js valid-flash-sale.txt
   ```

4. **Review test failures:**
   ```bash
   node tools/test-email-extraction.js > test-results.txt
   cat test-results.txt
   ```

## 🔐 Environment Variables

Required for all tools:
- `ADMIN_PASSWORD` - Admin panel password
- `CLOUDMAIL_SECRET` - CloudMailin webhook secret
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL
- `AIRTABLE_PAT` - Airtable personal access token
- `AIRTABLE_BASE_ID` - Airtable base ID

Optional (with defaults):
- `TEST_WEBHOOK_URL` - Defaults to `http://localhost:3001/webhook/agentmail`
- `API_URL` - Defaults to `http://localhost:3001`

---

**Last Updated:** November 23, 2025
