// Test Playwright fallback with client-side rendered sites
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function testScraper(url, expectedMethod) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${url}`);
  console.log(`Expected method: ${expectedMethod}`);
  console.log('='.repeat(80));
  
  try {
    const response = await fetch('http://localhost:3001/admin/scrape-product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'auth': ADMIN_PASSWORD
      },
      body: JSON.stringify({
        url,
        test: true
      })
    });
    
    const result = await response.json();
    
    if (!result.success) {
      console.log('❌ Scraping failed:', result.message);
      console.log('Meta:', JSON.stringify(result.meta, null, 2));
      return { success: false, url, error: result.message };
    }
    
    console.log('✅ Scraping succeeded!');
    console.log(`Method used: ${result.extractionMethod}`);
    console.log(`Confidence: ${result.confidence}%`);
    console.log(`Product: ${result.product.name}`);
    console.log(`Sale Price: $${result.product.salePrice}`);
    console.log(`Original Price: ${result.product.originalPrice ? '$' + result.product.originalPrice : 'N/A'}`);
    console.log(`Image: ${result.product.imageUrl}`);
    
    if (result.attempts) {
      console.log('\nAttempt history:');
      result.attempts.forEach((attempt, idx) => {
        console.log(`  ${idx + 1}. ${attempt.method}: ${attempt.outcome} (confidence: ${attempt.confidence}%, ${attempt.durationMs}ms)`);
        if (attempt.error) console.log(`     Error: ${attempt.error}`);
      });
    }
    
    const methodMatch = result.extractionMethod === expectedMethod;
    console.log(`\n${methodMatch ? '✅' : '⚠️ '} Method ${methodMatch ? 'matches' : 'does not match'} expectation (got ${result.extractionMethod}, expected ${expectedMethod})`);
    
    return { 
      success: true, 
      url, 
      method: result.extractionMethod,
      confidence: result.confidence,
      attempts: result.attempts 
    };
    
  } catch (error) {
    console.log('❌ Request failed:', error.message);
    return { success: false, url, error: error.message };
  }
}

async function runTests() {
  console.log('🧪 Testing Playwright Fallback System\n');
  
  const tests = [
    {
      name: 'Shopbop (Server-side rendered)',
      url: 'https://www.shopbop.com/ribbed-cotton-pullover-vince/vp/v=1/1548129623.htm',
      expectedMethod: 'fast'
    },
    {
      name: 'Nordstrom (Client-side rendered React SPA)',
      url: 'https://www.nordstrom.com/s/cashmere-crewneck-sweater/6955140',
      expectedMethod: 'playwright'
    },
    {
      name: 'Hiut Denim (Shopify Hydrogen)',
      url: 'https://hiutdenim.co.uk/products/lean-dean-dry-true-selvage',
      expectedMethod: 'playwright'
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    console.log(`\n📋 Test: ${test.name}`);
    const result = await testScraper(test.url, test.expectedMethod);
    results.push({ ...test, result });
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  
  results.forEach(({ name, expectedMethod, result }) => {
    if (!result.success) {
      console.log(`❌ ${name}: FAILED (${result.error})`);
    } else {
      const methodMatch = result.method === expectedMethod;
      console.log(`${methodMatch ? '✅' : '⚠️ '} ${name}: ${result.method} (confidence: ${result.confidence}%)`);
      if (!methodMatch) {
        console.log(`   Expected: ${expectedMethod}, got: ${result.method}`);
      }
    }
  });
  
  const passCount = results.filter(r => r.result.success && r.result.method === r.expectedMethod).length;
  const totalCount = results.length;
  
  console.log(`\n${passCount}/${totalCount} tests passed`);
}

runTests().catch(console.error);
