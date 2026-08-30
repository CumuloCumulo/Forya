/// <reference lib="webworker" />
import { buildTerrainMesh, type TerrainMeshRequest } from './TerrainMeshBuilder';

interface WorkerRequest {
  id: number;
  request: TerrainMeshRequest;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const data = buildTerrainMesh(request);
    const transfer: Transferable[] = [data.positions.buffer, data.normals.buffer, data.indices.buffer];
    if (data.physicsHeights) transfer.push(data.physicsHeights.buffer);
    self.postMessage({ id, data }, { transfer });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
