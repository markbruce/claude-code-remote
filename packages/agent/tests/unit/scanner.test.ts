/**
 * 工程扫描模块测试
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectScanner, ProjectMetadata } from '../../src/scanner';

// Mock fs module
jest.mock('fs');
jest.mock('os');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedOs = os as jest.Mocked<typeof os>;

describe('ProjectScanner', () => {
  let scanner: ProjectScanner;
  let claudeDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    scanner = new ProjectScanner();
    claudeDir = path.join(os.homedir(), '.claude');
  });

  describe('scanProjects', () => {
    it('should return empty array when Claude directory does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      const projects = await scanner.scanProjects();

      expect(projects).toEqual([]);
    });

    it('should find valid Claude projects', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'project1', isDirectory: () => true },
        { name: 'project2', isDirectory: () => true },
        { name: '.hidden', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
      ]);
      mockedFs.existsSync.mockImplementation((p: string) => {
        // Check for .claude subdirectory
        if (p.endsWith('.claude')) return true;
        // check for CLAUDE.md
        if (p.endsWith('CLAUDE.md')) return true;
        return false;
      });
      mockedFs.statSync.mockImplementation((p: string) => ({
        atime: new Date('2024-01-01'),
        isDirectory: () => true,
      }));
      mockedFs.existsSync.mockImplementation((p: string) => {
        // Check for .git
        if (p.includes('.git')) return true;
        // Check for package.json
        if (p.includes('package.json')) return true;
        return false;
      });

      const projects = await scanner.scanProjects({ forceRefresh: true });

      expect(projects.length).toBeGreaterThan(0);
      expect(projects[0].name).toBe('project1');
      expect(projects[1].name).toBe('project2');
    });
  });

  describe('getCachedProjects', () => {
    it('should return empty array when no cache', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const projects = scanner.getCachedProjects();

      expect(projects).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('should clear cache and () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.unlinkSync.mockImplementation(() => {});

      scanner.clearCache();

      expect(mockedFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('isValidClaudeProject', () => {
    it('should return true for directories with .claude subdirectory', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.statSync.mockReturnValue({ isDirectory: () => true });

      // Use bracket notation to access private method
      const result = (scanner as any)['isValidClaudeProject']('/some/path');

      expect(result).toBe(true);
    });

    it('should return true for directories with CLAUDE.md', () => {
      mockedFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('CLAUDE.md')) return true;
        return false;
      });

      const result = (scanner as any)['isValidClaudeProject']('/some/path');
      expect(result).toBe(true);
    });
  });
});
