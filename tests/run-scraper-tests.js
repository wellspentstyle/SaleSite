#!/usr/bin/env node

/**
 * Automated Scraper Test Runner
 * 
 * Tests the product scraper across different site types and generates a report.
 * Usage: node tests/run-scraper-tests.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TEST_CATALOG_PATH = path.join(__dirname, 'scraper-test-urls.json');
const RESULTS_DIR = path.join(__dirname, 'results');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Colors for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function testProduct(url, expectedData, category) {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/scrape-product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'auth': ADMIN_PASSWORD
      },
      body: JSON.stringify({ url, test: true })
    });

    const result = await response.json();
    
    if (!result.success) {
      return {
        passed: false,
        url,
        category,
        error: result.message,
        expected: expectedData
      };
    }

    const { product, testMetadata } = result;
    const validations = [];

    // Validation 1: Product name contains expected substring
    const nameMatch = !expectedData.expectedName || 
                      product.name.toLowerCase().includes(expectedData.expectedName.toLowerCase());
    validations.push({
      check: 'Product name',
      passed: nameMatch,
      expected: expectedData.expectedName || 'any',
      actual: product.name
    });

    // Validation 2: Image URL is valid and from expected host
    const imageValid = product.imageUrl && product.imageUrl.startsWith('http');
    const imageHostMatch = !expectedData.expectedImageHost || 
                          product.imageUrl.includes(expectedData.expectedImageHost);
    validations.push({
      check: 'Image URL valid',
      passed: imageValid,
      expected: 'http(s)://...',
      actual: product.imageUrl
    });
    validations.push({
      check: 'Image host',
      passed: imageHostMatch,
      expected: expectedData.expectedImageHost || 'any',
      actual: product.imageUrl
    });

    // Validation 3: Sale price exists and is valid
    const priceValid = product.salePrice && product.salePrice > 0;
    validations.push({
      check: 'Sale price valid',
      passed: priceValid,
      expected: '> 0',
      actual: product.salePrice
    });

    // Validation 4: Confidence meets minimum
    const confidenceValid = product.confidence >= (expectedData.minConfidence || 50);
    validations.push({
      check: 'Confidence score',
      passed: confidenceValid,
      expected: `>= ${expectedData.minConfidence || 50}`,
      actual: product.confidence
    });

    // Validation 5: Not a placeholder image
    const placeholderDomains = ['example.com', 'placeholder.com', 'placehold.it'];
    const notPlaceholder = !placeholderDomains.some(d => product.imageUrl.toLowerCase().includes(d));
    validations.push({
      check: 'Not placeholder image',
      passed: notPlaceholder,
      expected: 'real image',
      actual: product.imageUrl
    });

    const allPassed = validations.every(v => v.passed);

    return {
      passed: allPassed,
      url,
      category,
      product,
      testMetadata,
      validations,
      expected: expectedData
    };

  } catch (error) {
    return {
      passed: false,
      url,
      category,
      error: error.message,
      expected: expectedData
    };
  }
}

async function runTests() {
  console.log(`${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║   Product Scraper Test Runner         ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════╝${colors.reset}\n`);

  // Validation
  if (!ADMIN_PASSWORD) {
    console.error(`${colors.red}❌ Error: ADMIN_PASSWORD environment variable not set${colors.reset}`);
    process.exit(1);
  }

  // Load test catalog
  console.log(`📖 Loading test catalog from: ${TEST_CATALOG_PATH}`);
  const catalogData = JSON.parse(fs.readFileSync(TEST_CATALOG_PATH, 'utf8'));
  
  // Extract all test URLs
  const tests = [];
  for (const categoryData of catalogData.testCatalog) {
    for (const testCase of categoryData.urls) {
      if (testCase.url && testCase.url.trim() !== '') {
        tests.push({
          ...testCase,
          category: categoryData.category
        });
      }
    }
  }

  if (tests.length === 0) {
    console.log(`${colors.yellow}⚠️  No test URLs found in catalog. Please add URLs to ${TEST_CATALOG_PATH}${colors.reset}`);
    console.log(`\nSee the instructions field in the catalog for how to add test URLs.\n`);
    process.exit(0);
  }

  console.log(`✅ Found ${tests.length} test URLs\n`);

  // Run tests
  const results = [];
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`[${i + 1}/${tests.length}] Testing ${test.category}: ${test.url.substring(0, 60)}...`);
    
    const result = await testProduct(test.url, test, test.category);
    results.push(result);

    if (result.passed) {
      passed++;
      console.log(`  ${colors.green}✓ PASS${colors.reset} (${result.testMetadata?.phaseUsed || 'unknown'} phase, confidence: ${result.product?.confidence || 'N/A'}%)\n`);
    } else {
      failed++;
      console.log(`  ${colors.red}✗ FAIL${colors.reset}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      } else if (result.validations) {
        const failedChecks = result.validations.filter(v => !v.passed);
        failedChecks.forEach(check => {
          console.log(`    ${colors.red}✗${colors.reset} ${check.check}: expected ${check.expected}, got ${check.actual}`);
        });
      }
      console.log();
    }
  }

  // Generate summary
  console.log(`${colors.blue}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}           TEST SUMMARY                ${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════${colors.reset}\n`);

  const passRate = tests.length > 0 ? ((passed / tests.length) * 100).toFixed(1) : 0;
  console.log(`Total Tests: ${tests.length}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`Pass Rate: ${passRate}%\n`);

  // Category breakdown
  const byCategory = {};
  results.forEach(r => {
    if (!byCategory[r.category]) {
      byCategory[r.category] = { passed: 0, failed: 0, total: 0 };
    }
    byCategory[r.category].total++;
    if (r.passed) {
      byCategory[r.category].passed++;
    } else {
      byCategory[r.category].failed++;
    }
  });

  console.log(`${colors.blue}By Category:${colors.reset}`);
  Object.entries(byCategory).forEach(([category, stats]) => {
    const catPassRate = ((stats.passed / stats.total) * 100).toFixed(1);
    const color = catPassRate >= 80 ? colors.green : catPassRate >= 50 ? colors.yellow : colors.red;
    console.log(`  ${category}: ${color}${stats.passed}/${stats.total} (${catPassRate}%)${colors.reset}`);
  });
  console.log();

  // Phase usage stats
  const phaseStats = {};
  results.filter(r => r.testMetadata).forEach(r => {
    const phase = r.testMetadata.phaseUsed || 'unknown';
    phaseStats[phase] = (phaseStats[phase] || 0) + 1;
  });

  console.log(`${colors.blue}Extraction Phases Used:${colors.reset}`);
  Object.entries(phaseStats).forEach(([phase, count]) => {
    console.log(`  ${phase}: ${count}`);
  });
  console.log();

  // Save detailed results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsPath = path.join(RESULTS_DIR, `test-results-${timestamp}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: tests.length, passed, failed, passRate: parseFloat(passRate) },
    byCategory,
    phaseStats,
    results
  }, null, 2));

  console.log(`📊 Detailed results saved to: ${resultsPath}\n`);

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  console.error(`${colors.red}❌ Fatal error:${colors.reset}`, error);
  process.exit(1);
});
