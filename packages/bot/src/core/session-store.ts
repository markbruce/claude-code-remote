/**
 * Session Store — SQLite-backed session mapping persistence
 * Maps platform chat ID to active session state.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export type UserState = 'unbound' | 'bound' | 'machine_selected' | 'project_selected' | 'in_session';

export interface UserSession {
  id: number;
  platform_user_id: string;
  machine_id: string | null;
  machine_name: string | null;
  project_path: string | null;
  session_id: string | null;
  jwt: string | null;
  jwt_expires_at: string | null;
  refresh_secret: string | null;
  state: UserState;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_user_id TEXT NOT NULL,
    machine_id TEXT,
    machine_name TEXT,
    project_path TEXT,
    session_id TEXT,
    jwt TEXT,
    jwt_expires_at DATETIME,
    refresh_secret TEXT,
    state TEXT NOT NULL DEFAULT 'unbound',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_user_sessions_platform ON user_sessions(platform_user_id);
`;

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const dir = dbPath ? path.dirname(dbPath) : path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const resolvedPath = dbPath || path.join(dir, 'bot-sessions.db');
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLE_SQL);
  }

  getByPlatformUserId(platformUserId: string): UserSession | undefined {
    return this.db.prepare('SELECT * FROM user_sessions WHERE platform_user_id = ?').get(platformUserId) as UserSession | undefined;
  }

  upsertBinding(platformUserId: string, jwt: string, jwtExpiresAt: string, refreshSecret: string): void {
    const existing = this.getByPlatformUserId(platformUserId);
    if (existing) {
      this.db.prepare(
        'UPDATE user_sessions SET jwt = ?, jwt_expires_at = ?, refresh_secret = ?, state = ? WHERE platform_user_id = ?'
      ).run(jwt, jwtExpiresAt, refreshSecret, 'bound', platformUserId);
    } else {
      this.db.prepare(
        'INSERT INTO user_sessions (platform_user_id, jwt, jwt_expires_at, refresh_secret, state) VALUES (?, ?, ?, ?, ?)'
      ).run(platformUserId, jwt, jwtExpiresAt, refreshSecret, 'bound');
    }
  }

  updateMachine(platformUserId: string, machineId: string, machineName: string): void {
    this.db.prepare(
      'UPDATE user_sessions SET machine_id = ?, machine_name = ?, state = ? WHERE platform_user_id = ?'
    ).run(machineId, machineName, 'machine_selected', platformUserId);
  }

  updateProject(platformUserId: string, projectPath: string): void {
    this.db.prepare(
      'UPDATE user_sessions SET project_path = ?, state = ? WHERE platform_user_id = ?'
    ).run(projectPath, 'project_selected', platformUserId);
  }

  updateSession(platformUserId: string, sessionId: string): void {
    this.db.prepare(
      'UPDATE user_sessions SET session_id = ?, state = ? WHERE platform_user_id = ?'
    ).run(sessionId, 'in_session', platformUserId);
  }

  updateJwt(platformUserId: string, jwt: string, jwtExpiresAt: string): void {
    this.db.prepare(
      'UPDATE user_sessions SET jwt = ?, jwt_expires_at = ? WHERE platform_user_id = ?'
    ).run(jwt, jwtExpiresAt, platformUserId);
  }

  resetSession(platformUserId: string): void {
    this.db.prepare(
      'UPDATE user_sessions SET session_id = NULL, state = ? WHERE platform_user_id = ?'
    ).run('project_selected', platformUserId);
  }

  getAllBound(): UserSession[] {
    return this.db.prepare("SELECT * FROM user_sessions WHERE state != 'unbound' AND jwt IS NOT NULL").all() as UserSession[];
  }

  close(): void {
    this.db.close();
  }
}
