import { promises as fs } from 'fs';
import path from 'path';
import type { Response } from 'node-fetch';

// Test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'test-data');

export async function setupTestEnvironment() {
  // Set up test data directory
  process.env.DATA_DIR = TEST_DATA_DIR;
  await fs.mkdir(path.join(TEST_DATA_DIR, 'memories'), { recursive: true });
  
  // Set up JIRA test environment
  process.env.JIRA_BASE_URL = 'https://test-jira.example.com';
  process.env.JIRA_USER_EMAIL = 'test@example.com';
  process.env.JIRA_API_TOKEN = 'test-token';
}

export async function cleanupTestEnvironment() {
  // Clean up test data
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  
  // Clean up environment variables
  delete process.env.JIRA_BASE_URL;
  delete process.env.JIRA_USER_EMAIL;
  delete process.env.JIRA_API_TOKEN;
}

export function createMockResponse<T>(data: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    size: 0,
    buffer: async () => Buffer.from(''),
  } as Response;
}

export function loadFixture<T>(name: string): Promise<T> {
  const fixturePath = path.join(process.cwd(), 'test', 'fixtures', name);
  return fs.readFile(fixturePath, 'utf-8').then(JSON.parse);
} 