#!/usr/bin/env node

/**
 * Test Approval Workflow
 * 
 * This script:
 * 1. Enables approval mode
 * 2. Sends a test email
 * 3. Checks the pending sales queue
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';
const WEBHOOK_URL = 'http://localhost:3001/webhook/agentmail';
const CLOUDMAIL_SECRET = process.env.CLOUDMAIL_SECRET || 'test-secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error('\n❌ Error: ADMIN_PASSWORD environment variable is required');
  console.log('\nPlease run with: ADMIN_PASSWORD=your_password node test-approval-workflow.js\n');
  process.exit(1);
}

function createAuthHeader(secret) {
  const credentials = Buffer.from(`:${secret}`).toString('base64');
  return `Basic ${credentials}`;
}

async function enableApprovals() {
  console.log('\n📝 Enabling approval mode...');
  
  const response = await fetch(`${API_BASE}/approval-settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'auth': ADMIN_PASSWORD
    },
    body: JSON.stringify({ approvalsEnabled: true })
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log('✅ Approval mode ENABLED');
  } else {
    console.log('❌ Failed to enable approval mode');
    console.log(`   Status: ${response.status}`);
    console.log(`   Message: ${data.message || 'No message'}`);
  }
  
  return data.success;
}

async function sendTestEmail() {
  console.log('\n📧 Sending test sale email...');
  
  const testEmail = {
    envelope: { from: 'sales@testbrand.com' },
    headers: { subject: 'Flash Sale: 45% Off Everything!' },
    plain: `
Hi there!

Don't miss our biggest sale of the season!

🎉 45% OFF EVERYTHING 🎉
Use code: TEST45

Valid today through next Sunday!

Shop now: https://www.testbrand.com/sale

See you there,
Test Brand Team
    `.trim()
  };
  
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': createAuthHeader(CLOUDMAIL_SECRET)
    },
    body: JSON.stringify(testEmail)
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log('✅ Email processed successfully');
    console.log(`   Message: ${data.message}`);
  } else {
    console.log('❌ Email processing failed');
    console.log(`   Reason: ${data.message}`);
  }
  
  return data;
}

async function checkPendingSales() {
  console.log('\n📋 Checking pending sales queue...');
  
  const response = await fetch(`${API_BASE}/pending-sales`, {
    headers: { 'auth': ADMIN_PASSWORD }
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log(`✅ Found ${data.sales.length} pending sale(s)`);
    
    data.sales.forEach((sale, index) => {
      console.log(`\n   Sale ${index + 1}:`);
      console.log(`   - Company: ${sale.company}`);
      console.log(`   - Discount: ${sale.percentOff}%`);
      console.log(`   - Confidence: ${sale.confidence}%`);
      console.log(`   - Received: ${new Date(sale.receivedAt).toLocaleString()}`);
    });
  } else {
    console.log('❌ Failed to fetch pending sales');
  }
  
  return data;
}

async function runTest() {
  console.log('🧪 Testing Approval Workflow');
  console.log('============================\n');
  
  try {
    // Step 1: Enable approvals
    const enabled = await enableApprovals();
    if (!enabled) {
      console.log('\n❌ Test aborted - could not enable approvals');
      return;
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 2: Send test email
    const emailResult = await sendTestEmail();
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Check pending sales
    await checkPendingSales();
    
    console.log('\n\n✅ Test Complete!');
    console.log('================');
    console.log('Next steps:');
    console.log('1. Open http://localhost:5000/admin/sales-approvals');
    console.log('2. Review the pending sale');
    console.log('3. Click "Approve & Add to Airtable" or "Replace This" if duplicates exist');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

// Run the test
runTest().catch(console.error);
