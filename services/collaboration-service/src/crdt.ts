/**
 * Basic CRDT (Conflict-free Replicated Data Type) implementation
 * for collaborative text editing
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Represents a unique character identifier in the CRDT
 */
export interface CharacterId {
  timestamp: number;
  clientId: string;
  counter: number;
}

/**
 * A single character in the CRDT-based text
 */
export interface CrdtCharacter {
  id: CharacterId;
  content: string;
  leftId: CharacterId | null;
  rightId: CharacterId | null;
  deleted: boolean;
}

/**
 * A CRDT operation to be replicated across clients
 */
export interface CrdtOperation {
  id: string;
  clientId: string;
  timestamp: number;
  type: 'insert' | 'delete';
  character?: CrdtCharacter;
  characterId?: CharacterId;
  position?: number; // Local position for UI purposes
}

/**
 * Basic implementation of Logoot CRDT algorithm
 * Supports concurrent inserts and deletes with automatic conflict resolution
 */
export class LogootCRDT {
  private characters: CrdtCharacter[] = [];
  private clientId: string;
  private clock: number = 0;
  private operations: CrdtOperation[] = [];
  private maxIntegerValue = Math.pow(2, 32) - 1;

  constructor(clientId: string = uuidv4()) {
    this.clientId = clientId;
    // Initialize with boundary characters
    this.characters.push(
      this.createCharacter('', { timestamp: 0, clientId: '__start__', counter: 0 }, null),
      this.createCharacter('', { timestamp: 0, clientId: '__end__', counter: this.maxIntegerValue }, null)
    );
  }

  /**
   * Insert a character at a given position
   */
  insert(content: string, position: number): CrdtOperation {
    this.clock++;

    // Find the characters to the left and right of the position
    const { leftId, rightId } = this.findBoundaries(position);

    // Generate unique ID for new character
    const newId = this.generateId(leftId, rightId);

    // Create new character
    const character = this.createCharacter(content, newId, leftId, rightId);

    // Insert into sorted position
    this.insertCharacterInOrder(character);

    // Create and store operation
    const operation: CrdtOperation = {
      id: uuidv4(),
      clientId: this.clientId,
      timestamp: Date.now(),
      type: 'insert',
      character,
      position
    };

    this.operations.push(operation);
    return operation;
  }

  /**
   * Delete a character at a given position
   */
  delete(position: number): CrdtOperation {
    this.clock++;

    const character = this.getCharacterAt(position);
    if (!character) {
      throw new Error(`No character at position ${position}`);
    }

    // Mark as deleted instead of removing
    character.deleted = true;

    // Create and store operation
    const operation: CrdtOperation = {
      id: uuidv4(),
      clientId: this.clientId,
      timestamp: Date.now(),
      type: 'delete',
      characterId: character.id,
      position
    };

    this.operations.push(operation);
    return operation;
  }

  /**
   * Apply a remote operation
   */
  applyRemoteOperation(operation: CrdtOperation): void {
    if (operation.type === 'insert' && operation.character) {
      this.insertCharacterInOrder(operation.character);
    } else if (operation.type === 'delete' && operation.characterId) {
      const character = this.findCharacterById(operation.characterId);
      if (character) {
        character.deleted = true;
      }
    }
  }

  /**
   * Get current text content (excluding deleted characters)
   */
  getText(): string {
    return this.characters
      .filter(c => !c.deleted && c.id.clientId !== '__start__' && c.id.clientId !== '__end__')
      .map(c => c.content)
      .join('');
  }

  /**
   * Get text with deletion markers visible (for debugging)
   */
  getDebugText(): string {
    return this.characters
      .filter(c => c.id.clientId !== '__start__' && c.id.clientId !== '__end__')
      .map(c => (c.deleted ? `[X]` : c.content))
      .join('');
  }

  /**
   * Get operation history
   */
  getOperationHistory(): CrdtOperation[] {
    return [...this.operations];
  }

  /**
   * Merge with remote operations
   */
  merge(remoteOperations: CrdtOperation[]): void {
    // Sort operations by timestamp for consistent ordering
    const sorted = [...remoteOperations].sort((a, b) => a.timestamp - b.timestamp);
    for (const op of sorted) {
      this.applyRemoteOperation(op);
    }
  }

  /**
   * Get characters in order (including deleted ones)
   */
  getCharacters(): CrdtCharacter[] {
    return [...this.characters];
  }

  /**
   * Get character at position (0-indexed, excluding deleted)
   */
  private getCharacterAt(position: number): CrdtCharacter | null {
    let currentPos = 0;
    for (const char of this.characters) {
      if (!char.deleted && char.id.clientId !== '__start__' && char.id.clientId !== '__end__') {
        if (currentPos === position) {
          return char;
        }
        currentPos++;
      }
    }
    return null;
  }

  /**
   * Find character boundaries (left and right IDs) for position
   */
  private findBoundaries(position: number): { leftId: CharacterId; rightId: CharacterId } {
    let currentPos = 0;
    let leftId = this.characters[0].id; // Start boundary

    for (let i = 0; i < this.characters.length; i++) {
      const char = this.characters[i];
      if (!char.deleted && char.id.clientId !== '__start__' && char.id.clientId !== '__end__') {
        if (currentPos === position) {
          return { leftId, rightId: char.id };
        }
        leftId = char.id;
        currentPos++;
      }
    }

    return { leftId, rightId: this.characters[this.characters.length - 1].id };
  }

  /**
   * Generate unique ID between two boundary IDs
   */
  private generateId(leftId: CharacterId | null, rightId: CharacterId | null): CharacterId {
    const timestamp = Date.now();
    const counter = this.clock;

    // Simple approach: use timestamp and counter
    // In production, would need more sophisticated algorithm
    return {
      timestamp,
      clientId: this.clientId,
      counter
    };
  }

  /**
   * Create a character with optional boundaries
   */
  private createCharacter(
    content: string,
    id: CharacterId,
    leftId: CharacterId | null = null,
    rightId: CharacterId | null = null
  ): CrdtCharacter {
    return {
      id,
      content,
      leftId,
      rightId,
      deleted: false
    };
  }

  /**
   * Insert character maintaining sorted order
   */
  private insertCharacterInOrder(character: CrdtCharacter): void {
    // Find insertion point
    for (let i = 0; i < this.characters.length; i++) {
      if (this.compare(character.id, this.characters[i].id) < 0) {
        this.characters.splice(i, 0, character);
        return;
      }
    }
    this.characters.push(character);
  }

  /**
   * Find character by ID
   */
  private findCharacterById(id: CharacterId): CrdtCharacter | null {
    return this.characters.find(c => this.compareIds(c.id, id) === 0) || null;
  }

  /**
   * Compare two character IDs (for sorting)
   */
  private compare(id1: CharacterId, id2: CharacterId): number {
    if (id1.timestamp !== id2.timestamp) {
      return id1.timestamp - id2.timestamp;
    }
    if (id1.clientId !== id2.clientId) {
      return id1.clientId.localeCompare(id2.clientId);
    }
    return id1.counter - id2.counter;
  }

  /**
   * Compare two IDs for equality
   */
  private compareIds(id1: CharacterId, id2: CharacterId): number {
    if (id1.timestamp !== id2.timestamp) return id1.timestamp - id2.timestamp;
    if (id1.clientId !== id2.clientId) return id1.clientId.localeCompare(id2.clientId);
    return id1.counter - id2.counter;
  }

  /**
   * Get JSON representation for serialization
   */
  toJSON(): any {
    return {
      clientId: this.clientId,
      clock: this.clock,
      text: this.getText(),
      characters: this.characters,
      operations: this.operations
    };
  }

  /**
   * Load from JSON
   */
  static fromJSON(data: any): LogootCRDT {
    const crdt = new LogootCRDT(data.clientId);
    crdt.characters = data.characters;
    crdt.clock = data.clock;
    crdt.operations = data.operations;
    return crdt;
  }
}

/**
 * Session state with integrated CRDT
 */
export interface SessionState {
  sessionId: string;
  crdt: LogootCRDT;
  participants: Set<string>;
  lastSyncTime: number;
}

/**
 * Message format for WebSocket communication
 */
export interface CollaborativeMessage {
  type: 'sync' | 'operation' | 'ack' | 'full-sync';
  sessionId: string;
  clientId: string;
  payload: any;
  timestamp: number;
}

/**
 * Helper to create sync message
 */
export function createSyncMessage(
  sessionId: string,
  clientId: string,
  operations: CrdtOperation[]
): CollaborativeMessage {
  return {
    type: 'sync',
    sessionId,
    clientId,
    payload: { operations },
    timestamp: Date.now()
  };
}

/**
 * Helper to create full sync message
 */
export function createFullSyncMessage(
  sessionId: string,
  clientId: string,
  state: LogootCRDT
): CollaborativeMessage {
  return {
    type: 'full-sync',
    sessionId,
    clientId,
    payload: { state: state.toJSON() },
    timestamp: Date.now()
  };
}
