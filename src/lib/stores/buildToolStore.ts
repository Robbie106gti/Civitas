import { writable } from 'svelte/store';
import type { ToolId } from '../game/types';

export const activeTool = writable<ToolId>('clay_pit');
