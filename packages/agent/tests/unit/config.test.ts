/**
 * Agent配置管理模块测试
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager, AgentConfig } from '../../src/config';

// Mock fs module
jest.mock('fs');
jest.mock('os');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedOs = os as jest.Mocked<typeof os>;

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockConfigDir: string;
  let mockConfigPath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    configManager = new ConfigManager();

    // Get the private properties using bracket notation
    mockConfigDir = '/home/test-user/.claude-agent';
    mockConfigPath = '/home/test-user/.claude-agent/config.json';
  });

  describe('readConfig', () => {
    it('should return null when config file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const config = configManager.readConfig();

      expect(config).toBeNull();
      expect(mockedFs.existsSync).toHaveBeenCalledWith(mockConfigPath);
    });

    it('should return config when file exists', () => {
      const mockConfig: AgentConfig = {
        machine_id: 'test-machine-id',
        machine_token: 'test-token',
        server_url: 'http://test-server:3000',
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const config = configManager.readConfig();

      expect(config).toEqual(mockConfig);
    });

    it('should return null on parse error', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('invalid-json');

      const config = configManager.readConfig();

      expect(config).toBeNull();
    });
  });

  describe('writeConfig', () => {
    it('should write config to file', () => {
      const mockConfig: AgentConfig = {
        machine_id: 'new-machine-id',
        machine_token: 'new-token',
        server_url: 'http://new-server:3000',
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.mkdirSync.mockImplementation(() => {});
      mockedFs.writeFileSync.mockImplementation(() => {});

      configManager.writeConfig(mockConfig);

      expect(mockedFs.writeFileSync).toHaveBeenCalled();
      expect(mockedFs.writeFileSync.mock.calls[0][0]).lastCalledWith(
        expect(JSON.parse(mockConfig)).toEqual(expect.objectContaining({
          last_connected: expect.any(String)
        }))
      );
    });
  });

  describe('isBound', () => {
    it('should return true when machine_id and machine_token exist', () => {
      const mockConfig: AgentConfig = {
        machine_id: 'bound-machine',
        machine_token: 'bound-token',
        server_url: 'http://test-server:3000',
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const isBound = configManager.isBound();

      expect(isBound).toBe(true);
    });

    it('should return false when config does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const isBound = configManager.isBound();

      expect(isBound).toBe(false);
    });

    it('should return false when machine_id is empty', () => {
      const mockConfig = {
        machine_id: '',
        machine_token: 'some-token',
        server_url: 'http://test-server:3000',
      } as AgentConfig;

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const isBound = configManager.isBound();

      expect(isBound).toBe(false);
    });
  });

  describe('getAuthInfo', () => {
    it('should return auth info when bound', () => {
      const mockConfig: AgentConfig = {
        machine_id: 'auth-machine',
        machine_token: 'auth-token',
        server_url: 'http://test-server:3000',
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const authInfo = configManager.getAuthInfo();

      expect(authInfo).toEqual({
        machine_id: 'auth-machine',
        machine_token: 'auth-token'
      });
    });

    it('should return null when not bound', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const authInfo = configManager.getAuthInfo();

      expect(authInfo).toBeNull();
    });
  });

  describe('getHostname', () => {
    it('should return hostname', () => {
      mockedOs.hostname.mockReturnValue('test-hostname');

      const hostname = configManager.getHostname();

      expect(hostname).toBe('test-hostname');
    });
  });

  describe('getMachineInfo', () => {
    it('should return machine info', () => {
      mockedOs.hostname.mockReturnValue('test-host');
      mockedOs.platform.mockReturnValue('darwin');
      mockedOs.arch.mockReturnValue('x64');

      const info = configManager.getMachineInfo();

      expect(info).toEqual({
        hostname: 'test-host',
        platform: 'darwin',
        arch: 'x64'
      });
    });
  });

  describe('clearConfig', () => {
    it('should delete config file if exists', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.unlinkSync.mockImplementation(() => {});

      configManager.clearConfig();

      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(mockConfigPath);
    });

    it('should do nothing if config file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      configManager.clearConfig();

      expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
    });
  });
});
