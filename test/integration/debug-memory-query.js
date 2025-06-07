#!/usr/bin/env node

import { queryMemories } from '../dist/models/memoryModel.js';

async function debugMemoryQuery() {
  console.log('Testing memory query for localization project...\n');
  
  try {
    // Query exactly as the project open does
    console.log('1. Querying with multiple tags (as done in project open):');
    const localizationMemories = await queryMemories({
      filters: {
        tags: ['i18n', 'localization', 'translation', 'ICU'],
        archived: false
      },
      searchText: 'localization i18n translation ICU',
      sortBy: 'relevance',
      limit: 5
    });
    
    console.log(`Found ${localizationMemories.length} memories with multi-tag query`);
    localizationMemories.forEach(m => {
      console.log(`- ${m.summary} (tags: ${m.tags.join(', ')})`);
    });
    
    // Try without searchText
    console.log('\n2. Querying with multiple tags but NO searchText:');
    const noSearchTextMemories = await queryMemories({
      filters: {
        tags: ['i18n', 'localization', 'translation', 'ICU'],
        archived: false
      },
      sortBy: 'relevance',
      limit: 5
    });
    
    console.log(`Found ${noSearchTextMemories.length} memories without searchText`);
    noSearchTextMemories.forEach(m => {
      console.log(`- ${m.summary} (tags: ${m.tags.join(', ')})`);
    });
    
    // Try with simpler searchText
    console.log('\n3. Querying with tags and simple searchText "ICU":');
    const simpleSearchMemories = await queryMemories({
      filters: {
        tags: ['i18n'],
        archived: false
      },
      searchText: 'ICU',
      sortBy: 'relevance',
      limit: 5
    });
    
    console.log(`Found ${simpleSearchMemories.length} memories with simple search`);
    simpleSearchMemories.forEach(m => {
      console.log(`- ${m.summary}`);
      console.log(`  Content preview: ${m.content.substring(0, 100)}...`);
    });
    
    // Try without any filters at all
    console.log('\n4. Querying with NO filters (should get all):');
    const noFilterMemories = await queryMemories({
      limit: 10
    });
    
    console.log(`Found ${noFilterMemories.length} memories with no filters`);
    
  } catch (error) {
    console.error('Query failed:', error);
  }
}

// Run debug
debugMemoryQuery(); 