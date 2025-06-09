#!/usr/bin/env node

import { project } from '../dist/tools/project/unifiedProject.js';

async function testProjectMemoryInjection() {
  console.log('Testing memory injection for Translation Project...\n');
  
  try {
    // Use the actual Translation Project ID we found
    const projectId = 'proj_mbc0dt55_7a44tu';
    
    console.log('Opening Translation Project to check memory injection:');
    const openResult = await project({
      action: 'open',
      projectId: projectId
    });
    
    const content = openResult.content[0].text;
    
    // Check if memory context section exists
    if (content.includes('📚 Project Memory Context')) {
      console.log('✓ Memory context section found!');
      
      // Check if ICU memory is included
      if (content.includes('ICU Message Format')) {
        console.log('✓ ICU Message Format memory was successfully injected!');
        
        // Extract and show the memory section
        const memoryStart = content.indexOf('## 📚 Project Memory Context');
        const memoryEnd = content.indexOf('💡 *Use \'query_memory\'');
        
        if (memoryStart !== -1 && memoryEnd !== -1) {
          const memorySection = content.substring(memoryStart, memoryEnd + 50);
          console.log('\nMemory section:\n');
          console.log('=' .repeat(60));
          console.log(memorySection);
          console.log('=' .repeat(60));
        }
      } else {
        console.log('✗ ICU Message Format memory was NOT found');
        
        // Show what was actually in the memory section
        const memoryStart = content.indexOf('## 📚 Project Memory Context');
        if (memoryStart !== -1) {
          console.log('\nActual memory section content:');
          console.log(content.substring(memoryStart, memoryStart + 500));
        }
      }
    } else {
      console.log('✗ No memory context section found');
      console.log('\nProject content preview:');
      console.log(content.substring(0, 500));
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run test
testProjectMemoryInjection(); 