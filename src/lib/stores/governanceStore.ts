import { writable } from 'svelte/store';
import type { WorkerBridge } from '../game/workerBridge';

export const workerBridgeRef = writable<WorkerBridge | null>(null);
export const governancePanelOpen = writable(false);
