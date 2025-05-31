#!/usr/bin/env node

/**
 * Migration script to convert existing memory storage from single JSON files
 * to individual memory files with timestamp-based names
 */

const fs = require('fs').promises;
const path = require('path');

// Configuration
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MEMORY_DIR = path.join(DATA_DIR, 'memories');
const BACKUP_DIR = path.join(MEMORY_DIR, '_backup');

// Generate memory filename with timestamp
function generateMemoryFilename(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return `memory_${year}${month}${day}${hours}${minutes}${seconds}.json`;
}

async function migrateMemories() {
  console.log('Starting memory migration...');
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Memory directory: ${MEMORY_DIR}`);
  
  try {
    // Create backup directory
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    
    // Read all files in memory directory
    const files = await fs.readdir(MEMORY_DIR);
    const memoryFiles = files.filter(f => 
      (f.startsWith('project_') && f.endsWith('_memories.json')) || 
      f === 'global_memories.json'
    );
    
    if (memoryFiles.length === 0) {
      console.log('No memory files to migrate.');
      return;
    }
    
    console.log(`Found ${memoryFiles.length} memory file(s) to migrate.`);
    
    const newIndex = {
      projectIndex: {},
      typeIndex: {},
      tagIndex: {},
      entityIndex: {},
      temporalIndex: [],
      fileIndex: {}
    };
    
    let totalMemories = 0;
    
    // Process each memory file
    for (const file of memoryFiles) {
      const filePath = path.join(MEMORY_DIR, file);
      console.log(`\nProcessing ${file}...`);
      
      // Backup original file
      const backupPath = path.join(BACKUP_DIR, file);
      await fs.copyFile(filePath, backupPath);
      console.log(`  Backed up to ${backupPath}`);
      
      // Read memories from file
      const data = await fs.readFile(filePath, 'utf-8');
      const memories = JSON.parse(data);
      
      console.log(`  Found ${memories.length} memories`);
      
      // Process each memory
      for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        
        // Generate filename based on creation date
        const filename = generateMemoryFilename(memory.created);
        const newFilePath = path.join(MEMORY_DIR, filename);
        
        // Handle filename collisions by adding milliseconds
        let finalFilename = filename;
        let counter = 1;
        while (await fs.access(newFilePath).then(() => true).catch(() => false)) {
          const base = filename.replace('.json', '');
          finalFilename = `${base}_${counter}.json`;
          counter++;
        }
        
        // Save individual memory file
        await fs.writeFile(
          path.join(MEMORY_DIR, finalFilename), 
          JSON.stringify(memory, null, 2)
        );
        
        // Update index
        newIndex.fileIndex[memory.id] = finalFilename;
        
        // Update project index
        if (memory.projectId) {
          if (!newIndex.projectIndex[memory.projectId]) {
            newIndex.projectIndex[memory.projectId] = [];
          }
          newIndex.projectIndex[memory.projectId].push(memory.id);
        }
        
        // Update type index
        if (!newIndex.typeIndex[memory.type]) {
          newIndex.typeIndex[memory.type] = [];
        }
        newIndex.typeIndex[memory.type].push(memory.id);
        
        // Update tag index
        if (memory.tags) {
          memory.tags.forEach(tag => {
            if (!newIndex.tagIndex[tag]) {
              newIndex.tagIndex[tag] = [];
            }
            newIndex.tagIndex[tag].push(memory.id);
          });
        }
        
        // Update entity index
        if (memory.entities) {
          memory.entities.forEach(entity => {
            if (!newIndex.entityIndex[entity]) {
              newIndex.entityIndex[entity] = [];
            }
            newIndex.entityIndex[entity].push(memory.id);
          });
        }
        
        // Add to temporal index
        newIndex.temporalIndex.push({ 
          id: memory.id, 
          timestamp: new Date(memory.created) 
        });
        
        totalMemories++;
        
        if ((i + 1) % 10 === 0) {
          console.log(`    Migrated ${i + 1}/${memories.length} memories`);
        }
      }
      
      // Remove original file after successful migration
      await fs.unlink(filePath);
      console.log(`  Removed original file: ${file}`);
    }
    
    // Sort temporal index
    newIndex.temporalIndex.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    // Save new index
    const indexPath = path.join(MEMORY_DIR, '_index.json');
    await fs.writeFile(indexPath, JSON.stringify(newIndex, null, 2));
    console.log(`\nSaved new index to ${indexPath}`);
    
    console.log(`\nMigration complete! Migrated ${totalMemories} memories.`);
    console.log(`Original files backed up to: ${BACKUP_DIR}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateMemories().catch(console.error); 