// Noise module interface - all noise generators implement this

export interface INoiseModule {
  get(x: number, y: number): number;
}
