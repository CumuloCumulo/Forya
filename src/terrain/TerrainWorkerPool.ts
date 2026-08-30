import { buildTerrainMesh, type TerrainMeshData, type TerrainMeshRequest } from './TerrainMeshBuilder';

interface QueuedJob {
  id: number;
  request: TerrainMeshRequest;
  resolve: (data: TerrainMeshData) => void;
  reject: (error: Error) => void;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
  job: QueuedJob | null;
}

export class TerrainWorkerPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: QueuedJob[] = [];
  private nextId = 1;

  constructor() {
    if (typeof Worker === 'undefined') return;
    const hardwareThreads = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
    const workerCount = Math.max(1, Math.min(3, hardwareThreads - 1));
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL('./TerrainWorker.ts', import.meta.url), { type: 'module' });
      const slot: WorkerSlot = { worker, busy: false, job: null };
      worker.onmessage = event => this.finish(slot, event.data);
      worker.onerror = event => this.fail(slot, new Error(event.message || 'Terrain worker failed'));
      this.slots.push(slot);
    }
  }

  request(request: TerrainMeshRequest, priority = 0): Promise<TerrainMeshData> {
    if (this.slots.length === 0) {
      return Promise.resolve().then(() => buildTerrainMesh(request));
    }
    return new Promise((resolve, reject) => {
      const job = { id: this.nextId++, request, resolve, reject };
      if (priority > 0) this.queue.unshift(job);
      else this.queue.push(job);
      this.pump();
    });
  }

  dispose(): void {
    for (const slot of this.slots) slot.worker.terminate();
    this.slots.length = 0;
    const error = new Error('Terrain worker pool disposed');
    for (const job of this.queue.splice(0)) job.reject(error);
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.busy || this.queue.length === 0) continue;
      const job = this.queue.shift()!;
      slot.busy = true;
      slot.job = job;
      slot.worker.postMessage({ id: job.id, request: job.request });
    }
  }

  private finish(slot: WorkerSlot, response: { id: number; data?: TerrainMeshData; error?: string }): void {
    const job = slot.job;
    slot.job = null;
    slot.busy = false;
    if (job && response.id === job.id) {
      if (response.error || !response.data) job.reject(new Error(response.error || 'Terrain worker returned no data'));
      else job.resolve(response.data);
    }
    this.pump();
  }

  private fail(slot: WorkerSlot, error: Error): void {
    slot.job?.reject(error);
    slot.job = null;
    slot.busy = false;
    this.pump();
  }
}
