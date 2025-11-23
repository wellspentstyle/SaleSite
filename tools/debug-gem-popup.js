#!/usr/bin/env node

/**
 * Gem Popup Debugger
 * 
 * Shows you EXACTLY what popups/modals appear and how to close them
 * Run with: node debug-gem-popup.js <magic-link>
 */

import { chromium } from 'playwright';

const magicLink = process.argv[2];

if (!magicLink) {
  console.error('❌ Usage: node debug-gem-popup.js <magic-link>');
  process.exit(1);
}

async function debugPopups() {
  let browser;
  
  try {
    console.log('🔍 Gem Popup Debugger\n');
    console.log('This tool will show you ALL interactive elements on the page');
    console.log('to help identify what\'s blocking authentication.\n');
    
    browser = await chromium.launch({
      headless: false, // VISIBLE browser
      slowMo: 500,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    console.log('📍 Step 1: Navigating to magic link...\n');
    await page.goto(magicLink, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    console.log(`Current URL: ${page.url()}`);
    console.log(`Page Title: ${await page.title()}\n`);
    
    // Take initial screenshot
    await page.screenshot({ path: '/tmp/gem-popup-1-initial.png', fullPage: true });
    console.log('📸 Screenshot: /tmp/gem-popup-1-initial.png\n');
    
    // ANALYZE THE PAGE
    console.log('🔍 Step 2: Analyzing page elements...\n');
    
    const analysis = await page.evaluate(() => {
      const results = {
        buttons: [],
        links: [],
        modals: [],
        overlays: [],
        forms: [],
        interactive: []
      };
      
      // Find all buttons
      document.querySelectorAll('button').forEach((btn, i) => {
        const rect = btn.getBoundingClientRect();
        const isVisible = rect.width > 0 && 
                         rect.height > 0 && 
                         window.getComputedStyle(btn).display !== 'none' &&
                         window.getComputedStyle(btn).visibility !== 'hidden';
        
        if (isVisible) {
          results.buttons.push({
            index: i,
            text: btn.textContent?.trim().substring(0, 50) || '',
            classes: btn.className,
            ariaLabel: btn.getAttribute('aria-label') || '',
            type: btn.type,
            position: { x: Math.round(rect.x), y: Math.round(rect.y) }
          });
        }
      });
      
      // Find all visible links
      document.querySelectorAll('a').forEach((link, i) => {
        const rect = link.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        if (isVisible) {
          results.links.push({
            index: i,
            text: link.textContent?.trim().substring(0, 50) || '',
            href: link.href,
            position: { x: Math.round(rect.x), y: Math.round(rect.y) }
          });
        }
      });
      
      // Find modals/dialogs
      document.querySelectorAll('[role="dialog"], [role="alertdialog"], [class*="modal"], [class*="popup"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        if (isVisible) {
          results.modals.push({
            role: el.getAttribute('role'),
            classes: el.className,
            text: el.textContent?.trim().substring(0, 100) || '',
            hasCloseButton: !!el.querySelector('button[aria-label*="close"], button:has-text("×")')
          });
        }
      });
      
      // Find overlays
      document.querySelectorAll('[class*="overlay"], [class*="backdrop"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const isVisible = rect.width > 0 && 
                         rect.height > 0 && 
                         style.display !== 'none';
        
        if (isVisible) {
          results.overlays.push({
            classes: el.className,
            zIndex: style.zIndex,
            opacity: style.opacity
          });
        }
      });
      
      // Find forms
      document.querySelectorAll('form').forEach(form => {
        const inputs = form.querySelectorAll('input, textarea, select');
        results.forms.push({
          action: form.action,
          method: form.method,
          inputCount: inputs.length
        });
      });
      
      return results;
    });
    
    // Print analysis
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 PAGE ANALYSIS RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log(`🔘 BUTTONS (${analysis.buttons.length} visible):`);
    if (analysis.buttons.length === 0) {
      console.log('   No visible buttons found\n');
    } else {
      analysis.buttons.forEach((btn, i) => {
        console.log(`\n   ${i + 1}. "${btn.text}"`);
        if (btn.ariaLabel) console.log(`      aria-label: ${btn.ariaLabel}`);
        if (btn.classes) console.log(`      classes: ${btn.classes}`);
        console.log(`      position: (${btn.position.x}, ${btn.position.y})`);
        console.log(`      type: ${btn.type || 'button'}`);
      });
      console.log('');
    }
    
    console.log(`🔗 LINKS (${analysis.links.length} visible):`);
    if (analysis.links.length === 0) {
      console.log('   No visible links found\n');
    } else {
      analysis.links.slice(0, 10).forEach((link, i) => {
        console.log(`   ${i + 1}. "${link.text}" → ${link.href.substring(0, 50)}...`);
      });
      if (analysis.links.length > 10) {
        console.log(`   ... and ${analysis.links.length - 10} more\n`);
      }
      console.log('');
    }
    
    console.log(`🪟 MODALS/DIALOGS (${analysis.modals.length} visible):`);
    if (analysis.modals.length === 0) {
      console.log('   No modals detected\n');
    } else {
      analysis.modals.forEach((modal, i) => {
        console.log(`\n   ${i + 1}. ${modal.role || 'Modal'}`);
        console.log(`      classes: ${modal.classes}`);
        console.log(`      text: ${modal.text}`);
        console.log(`      has close button: ${modal.hasCloseButton ? 'YES' : 'NO'}`);
      });
      console.log('');
    }
    
    console.log(`🎭 OVERLAYS (${analysis.overlays.length} visible):`);
    if (analysis.overlays.length === 0) {
      console.log('   No overlays detected\n');
    } else {
      analysis.overlays.forEach((overlay, i) => {
        console.log(`   ${i + 1}. z-index: ${overlay.zIndex}, opacity: ${overlay.opacity}`);
      });
      console.log('');
    }
    
    console.log(`📝 FORMS (${analysis.forms.length} total):`);
    if (analysis.forms.length > 0) {
      analysis.forms.forEach((form, i) => {
        console.log(`   ${i + 1}. ${form.method?.toUpperCase() || 'GET'} ${form.action || 'current page'} (${form.inputCount} inputs)`);
      });
    }
    console.log('');
    
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // RECOMMENDATIONS
    console.log('💡 RECOMMENDATIONS:\n');
    
    if (analysis.modals.length > 0) {
      console.log('⚠️  MODALS DETECTED! This is likely blocking authentication.');
      console.log('   Look for buttons like:');
      analysis.modals.forEach(modal => {
        if (modal.hasCloseButton) {
          console.log('   - Close button (×) in the modal');
        }
      });
      console.log('   - "Accept", "OK", "Continue" buttons');
      console.log('   - "Not Now", "Later" buttons\n');
    }
    
    if (analysis.buttons.length > 0) {
      const suspiciousButtons = analysis.buttons.filter(btn => 
        btn.text.toLowerCase().includes('accept') ||
        btn.text.toLowerCase().includes('continue') ||
        btn.text.toLowerCase().includes('ok') ||
        btn.text.toLowerCase().includes('close') ||
        btn.text.toLowerCase().includes('not now') ||
        btn.text === '×'
      );
      
      if (suspiciousButtons.length > 0) {
        console.log('🎯 LIKELY POPUP BUTTONS FOUND:');
        suspiciousButtons.forEach(btn => {
          console.log(`   - "${btn.text}" at (${btn.position.x}, ${btn.position.y})`);
        });
        console.log('');
      }
    }
    
    if (analysis.overlays.length > 0) {
      console.log('⚠️  OVERLAY DETECTED! Page might be blocked by a modal backdrop.\n');
    }
    
    // Interactive mode
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎮 INTERACTIVE MODE');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('The browser window will stay open for 60 seconds.');
    console.log('You can:');
    console.log('1. Manually click any popups you see');
    console.log('2. Use DevTools to inspect elements');
    console.log('3. Watch what happens when you interact\n');
    
    console.log('⏱️  Waiting 60 seconds...\n');
    
    // Highlight all buttons on the page for easy identification
    await page.evaluate(() => {
      document.querySelectorAll('button').forEach((btn, i) => {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // Add a red border
          btn.style.outline = '3px solid red';
          btn.style.outlineOffset = '2px';
          
          // Add a label
          const label = document.createElement('div');
          label.textContent = `BTN ${i + 1}`;
          label.style.position = 'absolute';
          label.style.background = 'red';
          label.style.color = 'white';
          label.style.padding = '2px 5px';
          label.style.fontSize = '10px';
          label.style.zIndex = '999999';
          label.style.pointerEvents = 'none';
          document.body.appendChild(label);
          
          const updateLabelPosition = () => {
            const rect = btn.getBoundingClientRect();
            label.style.left = (rect.left + window.scrollX) + 'px';
            label.style.top = (rect.top + window.scrollY - 15) + 'px';
          };
          
          updateLabelPosition();
          window.addEventListener('scroll', updateLabelPosition);
        }
      });
    });
    
    console.log('✅ All buttons are now highlighted in RED on the page!\n');
    
    await page.waitForTimeout(60000);
    
    // Take final screenshot
    await page.screenshot({ path: '/tmp/gem-popup-2-final.png', fullPage: true });
    console.log('📸 Final screenshot: /tmp/gem-popup-2-final.png\n');
    
    const finalUrl = page.url();
    console.log(`Final URL: ${finalUrl}`);
    
    if (finalUrl.includes('/shop') || finalUrl.includes('/items')) {
      console.log('✅ SUCCESS! You were able to get to the items page!');
      console.log('   Tell me which button(s) you clicked and I\'ll update the scraper.\n');
    } else {
      console.log('❌ Still on login page. The popup might be harder to dismiss.\n');
    }
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

debugPopups();
