import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  createMemory,
  getMemory,
  updateMemory,
  deleteMemory,
  queryMemories,
  archiveOldMemories,
  decayRelevanceScores
} from '../src/models/memoryModel.js';
import {
  recordMemory,
  queryMemory,
  updateMemoryContent,
  deleteMemoryById,
  memoryMaintenance
} from '../src/tools/memoryTool.js';
import { MemoryType } from '../src/types/memory.js';
import {
  calculateTextSimilarity,
  calculateWeightedSimilarity,
  extractEntities,
  findMemoryChains,
  consolidateMemories
} from '../src/utils/memoryUtils.js';
import { promises as fs } from 'fs';
import path from 'path';

// Test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'test-data');

describe('Memory System Tests', () => {
  
  beforeEach(async () => {
    // Set up test data directory
    process.env.DATA_DIR = TEST_DATA_DIR;
    await fs.mkdir(path.join(TEST_DATA_DIR, 'memories'), { recursive: true });
  });
  
  afterEach(async () => {
    // Clean up test data
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });
  
  describe('Memory Model Tests', () => {
    it('should create a memory successfully', async () => {
      const memory = await createMemory({
        content: 'Test memory content',
        summary: 'Test summary',
        type: MemoryType.BREAKTHROUGH,
        confidence: 0.9,
        tags: ['test', 'unit-test'],
        entities: ['testFunction', 'testFile.ts'],
        relatedMemories: [],
        contextSnapshot: {},
        author: 'test-agent',
        metadata: {},
        triggerContext: 'unit test'
      });
      
      expect(memory).toBeDefined();
      expect(memory.id).toMatch(/^mem_/);
      expect(memory.type).toBe(MemoryType.BREAKTHROUGH);
      expect(memory.relevanceScore).toBe(1.0);
      expect(memory.accessCount).toBe(0);
    });
    
    it('should retrieve and update access count', async () => {
      const created = await createMemory({
        content: 'Test memory',
        summary: 'Test',
        type: MemoryType.DECISION,
        confidence: 0.8,
        tags: [],
        relatedMemories: [],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      const retrieved = await getMemory(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.accessCount).toBe(1);
    });
    
    it('should update memory and increment version', async () => {
      const created = await createMemory({
        content: 'Original content',
        summary: 'Original',
        type: MemoryType.FEEDBACK,
        confidence: 0.7,
        tags: ['original'],
        relatedMemories: [],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      const updated = await updateMemory(created.id, {
        content: 'Updated content',
        tags: ['original', 'updated']
      });
      
      expect(updated).toBeDefined();
      expect(updated!.version).toBe(2);
      expect(updated!.content).toBe('Updated content');
      expect(updated!.tags).toContain('updated');
    });
    
    it('should query memories with filters', async () => {
      // Create test memories
      await createMemory({
        content: 'Memory 1',
        summary: 'Test 1',
        type: MemoryType.BREAKTHROUGH,
        confidence: 0.9,
        tags: ['javascript'],
        projectId: 'project1',
        relatedMemories: [],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      await createMemory({
        content: 'Memory 2',
        summary: 'Test 2',
        type: MemoryType.DECISION,
        confidence: 0.8,
        tags: ['typescript'],
        projectId: 'project1',
        relatedMemories: [],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      await createMemory({
        content: 'Memory 3',
        summary: 'Test 3',
        type: MemoryType.BREAKTHROUGH,
        confidence: 0.7,
        tags: ['python'],
        projectId: 'project2',
        relatedMemories: [],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      // Test type filter
      const breakthroughs = await queryMemories({
        filters: { types: [MemoryType.BREAKTHROUGH] }
      });
      expect(breakthroughs.length).toBe(2);
      
      // Test project filter
      const project1Memories = await queryMemories({
        filters: { projectId: 'project1' }
      });
      expect(project1Memories.length).toBe(2);
      
      // Test tag filter
      const jsMemories = await queryMemories({
        filters: { tags: ['javascript'] }
      });
      expect(jsMemories.length).toBe(1);
    });
  });
  
  describe('Memory Tool Tests', () => {
    it('should detect duplicates within time window', async () => {
      // Create first memory
      const result1 = await recordMemory({
        content: 'I solved the performance issue by implementing caching',
        summary: 'Fixed performance issue',
        type: 'breakthrough',
        confidence: 0.9,
        tags: ['performance', 'caching']
      });
      
      expect(result1.content[0].text).toContain('successfully');
      
      // Try to create duplicate
      const result2 = await recordMemory({
        content: 'I solved the performance issue by implementing caching',
        summary: 'Fixed performance issue',
        type: 'breakthrough',
        confidence: 0.9,
        tags: ['performance', 'caching']
      });
      
      expect(result2.content[0].text).toContain('similar memory already exists');
    });
    
    it('should extract entities from content', async () => {
      const result = await recordMemory({
        content: 'Fixed bug in userController.ts by updating the getUserById function. Referenced package @company/auth-utils.',
        summary: 'Fixed user controller bug',
        type: 'error_recovery',
        confidence: 0.8,
        tags: ['bug-fix']
      });
      
      expect(result.content[0].text).toContain('userController.ts');
      expect(result.content[0].text).toContain('@company/auth-utils');
    });
  });
  
  describe('Memory Utils Tests', () => {
    it('should calculate text similarity correctly', () => {
      const similarity1 = calculateTextSimilarity(
        'The quick brown fox jumps over the lazy dog',
        'The quick brown fox jumps over the lazy cat'
      );
      expect(similarity1).toBeGreaterThan(0.8);
      
      const similarity2 = calculateTextSimilarity(
        'JavaScript is great',
        'Python is awesome'
      );
      expect(similarity2).toBeLessThan(0.3);
    });
    
    it('should calculate weighted similarity with stop words', () => {
      const similarity = calculateWeightedSimilarity(
        'The implementation uses a cache to improve performance',
        'We use caching for better performance improvements'
      );
      expect(similarity).toBeGreaterThan(0.5);
    });
    
    it('should extract entities correctly', () => {
      const entities = extractEntities(
        'Updated src/components/Button.tsx and imported @mui/material. ' +
        'Fixed the onClick handler and improved performance.'
      );
      
      expect(entities).toContain('src/components/Button.tsx');
      expect(entities).toContain('@mui/material');
      expect(entities).toContain('onClick');
    });
    
    it('should find memory chains', async () => {
      // Create related memories
      const memory1 = await createMemory({
        content: 'Started working on authentication',
        summary: 'Auth implementation start',
        type: MemoryType.DECISION,
        confidence: 0.8,
        tags: ['auth', 'security'],
        relatedMemories: [],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      const memory2 = await createMemory({
        content: 'Decided to use JWT for authentication',
        summary: 'JWT decision',
        type: MemoryType.DECISION,
        confidence: 0.9,
        tags: ['auth', 'jwt'],
        relatedMemories: [memory1.id],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      const memory3 = await createMemory({
        content: 'Implemented JWT refresh tokens',
        summary: 'JWT refresh implementation',
        type: MemoryType.BREAKTHROUGH,
        confidence: 0.85,
        tags: ['auth', 'jwt', 'security'],
        relatedMemories: [memory2.id],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      const memories = [memory1, memory2, memory3];
      const chains = findMemoryChains(memories);
      
      expect(chains.size).toBeGreaterThan(0);
      const chain = chains.get(memory1.id);
      expect(chain).toBeDefined();
      expect(chain!.length).toBeGreaterThanOrEqual(2);
    });
    
    it('should consolidate similar memories', async () => {
      const memories = [
        await createMemory({
          content: 'Fixed the null pointer exception in user service',
          summary: 'Fixed NPE in user service',
          type: MemoryType.ERROR_RECOVERY,
          confidence: 0.8,
          tags: ['bug', 'npe'],
          relatedMemories: [],
          contextSnapshot: {},
          author: 'test',
          metadata: {}
        }),
        await createMemory({
          content: 'Resolved null pointer exception in the user service module',
          summary: 'Resolved NPE in user service',
          type: MemoryType.ERROR_RECOVERY,
          confidence: 0.85,
          tags: ['bug', 'error'],
          relatedMemories: [],
          contextSnapshot: {},
          author: 'test',
          metadata: {}
        })
      ];
      
      const { consolidated, mergeMap } = consolidateMemories(memories);
      
      expect(consolidated.length).toBeLessThan(memories.length);
      expect(mergeMap.size).toBeGreaterThan(0);
    });
  });
  
  describe('Memory Lifecycle Tests', () => {
    it('should archive old memories with low relevance', async () => {
      // Create an old memory
      const oldMemory = await createMemory({
        content: 'Old memory content',
        summary: 'Old memory',
        type: MemoryType.NOTE,
        confidence: 0.5,
        tags: ['old'],
        relatedMemories: [],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      // Manually set old date and low relevance
      await updateMemory(oldMemory.id, {
        relevanceScore: 0.2,
        created: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days old
      });
      
      const archivedCount = await archiveOldMemories(90);
      expect(archivedCount).toBeGreaterThan(0);
    });
    
    it('should decay relevance scores over time', async () => {
      // Create memories with different ages
      const recentMemory = await createMemory({
        content: 'Recent memory',
        summary: 'Recent',
        type: MemoryType.BREAKTHROUGH,
        confidence: 0.9,
        tags: ['recent'],
        relatedMemories: [],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      const oldMemory = await createMemory({
        content: 'Old memory',
        summary: 'Old',
        type: MemoryType.DECISION,
        confidence: 0.8,
        tags: ['old'],
        relatedMemories: [],
        contextSnapshot: {},
        author: 'test',
        metadata: {}
      });
      
      // Set old access date for the old memory
      await updateMemory(oldMemory.id, {
        lastAccessed: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days old
      });
      
      await decayRelevanceScores();
      
      const recentAfterDecay = await getMemory(recentMemory.id);
      const oldAfterDecay = await getMemory(oldMemory.id);
      
      expect(recentAfterDecay!.relevanceScore).toBeGreaterThan(oldAfterDecay!.relevanceScore);
    });
  });
  
  describe('Memory Analytics Tests', () => {
    it('should generate memory statistics', async () => {
      // Create test memories
      await Promise.all([
        createMemory({
          content: 'Test 1',
          summary: 'Test 1',
          type: MemoryType.BREAKTHROUGH,
          confidence: 0.9,
          tags: ['test'],
          projectId: 'project1',
          relatedMemories: [],
          contextSnapshot: {},
          author: 'test',
          metadata: {}
        }),
        createMemory({
          content: 'Test 2',
          summary: 'Test 2',
          type: MemoryType.DECISION,
          confidence: 0.8,
          tags: ['test'],
          projectId: 'project1',
          relatedMemories: [],
          contextSnapshot: {},
          author: 'test',
          metadata: {}
        })
      ]);
      
      const result = await memoryMaintenance({
        operation: 'get_stats'
      });
      
      expect(result.content[0].text).toContain('Total Memories: 2');
      expect(result.content[0].text).toContain('breakthrough: 1');
      expect(result.content[0].text).toContain('decision: 1');
    });
  });
}); 