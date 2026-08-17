import * as crypto from 'node:crypto';
import type { StateStore, SecretStore } from './storage';

export type ToolId = 'codex' | 'claude';

export interface Profile {
  id: string;
  toolId: ToolId;
  label: string;
  metadata: Record<string, unknown>;
  hasSnapshot: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateInput {
  toolId: ToolId;
  label: string;
  metadata?: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
}

const PROFILES_KEY = 'agentswitch.profiles';
const secretKey = (id: string): string => `agentswitch.profile.${id}.snapshot`;

/**
 * Profile metadata (label, email, plan, timestamps) lives in the StateStore.
 * Token snapshots live only in the SecretStore, keyed separately by profile
 * id — never in the same object, so a bug that logs or serializes a Profile
 * can never leak a token.
 */
export class ProfileStore {
  constructor(
    private readonly state: StateStore,
    private readonly secrets: SecretStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  list(toolId?: ToolId): Profile[] {
    const all = this.state.get<Profile[]>(PROFILES_KEY) ?? [];
    return toolId ? all.filter((p) => p.toolId === toolId) : all;
  }

  get(id: string): Profile | undefined {
    return this.list().find((p) => p.id === id);
  }

  async create(input: CreateInput): Promise<Profile> {
    const timestamp = this.now();
    const profile: Profile = {
      id: crypto.randomUUID(),
      toolId: input.toolId,
      label: input.label,
      metadata: input.metadata ?? {},
      hasSnapshot: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (input.snapshot) {
      await this.secrets.store(secretKey(profile.id), JSON.stringify(input.snapshot));
      profile.hasSnapshot = true;
    }
    await this.saveAll([...this.list(), profile]);
    return profile;
  }

  async rename(id: string, label: string): Promise<void> {
    await this.update(id, (profile) => ({ ...profile, label }));
  }

  async remove(id: string): Promise<void> {
    await this.secrets.delete(secretKey(id));
    await this.saveAll(this.list().filter((p) => p.id !== id));
  }

  async getSnapshot(id: string): Promise<Record<string, unknown> | undefined> {
    const raw = await this.secrets.get(secretKey(id));
    return raw ? JSON.parse(raw) : undefined;
  }

  async setSnapshot(id: string, snapshot: Record<string, unknown>): Promise<void> {
    await this.secrets.store(secretKey(id), JSON.stringify(snapshot));
    await this.update(id, (profile) => ({ ...profile, hasSnapshot: true }));
  }

  private async update(id: string, mutate: (profile: Profile) => Profile): Promise<void> {
    const timestamp = this.now();
    await this.saveAll(
      this.list().map((p) => (p.id === id ? { ...mutate(p), updatedAt: timestamp } : p)),
    );
  }

  private async saveAll(profiles: Profile[]): Promise<void> {
    await this.state.update(PROFILES_KEY, profiles);
  }
}
