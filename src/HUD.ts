export interface HUDState {
  speedKmh: number;
  altitude: number;
  verticalSpeed: number;
  boost: number;
  checkpoint: number;
  checkpointTotal: number;
  objectiveDistance: number;
}

export class HUD {
  private speed = document.getElementById('speed-value')!;
  private altitude = document.getElementById('altitude-value')!;
  private verticalSpeed = document.getElementById('vertical-value')!;
  private boost = document.getElementById('boost-fill')! as HTMLElement;
  private checkpoint = document.getElementById('checkpoint-current')!;
  private checkpointTotal = document.getElementById('checkpoint-total')!;
  private objectiveDistance = document.getElementById('objective-distance')!;
  private toast = document.getElementById('toast')!;
  private toastTimer = 0;
  private previousCheckpoint = 0;

  update(state: HUDState, deltaTime: number): void {
    this.speed.textContent = Math.round(state.speedKmh).toString().padStart(3, '0');
    this.altitude.textContent = `${Math.max(0, Math.round(state.altitude)).toString().padStart(4, '0')} M`;
    const verticalDirection = state.verticalSpeed > 0.5 ? '↑' : state.verticalSpeed < -0.5 ? '↓' : '—';
    this.verticalSpeed.textContent = `${verticalDirection} ${Math.abs(state.verticalSpeed).toFixed(1)} M/S`;
    this.verticalSpeed.classList.toggle('climbing', state.verticalSpeed > 0.5);
    this.boost.style.transform = `scaleX(${Math.max(0, Math.min(1, state.boost))})`;
    this.checkpoint.textContent = Math.min(state.checkpoint + 1, state.checkpointTotal).toString().padStart(2, '0');
    this.checkpointTotal.textContent = state.checkpointTotal.toString().padStart(2, '0');
    this.objectiveDistance.textContent = Number.isFinite(state.objectiveDistance)
      ? `${Math.max(0, Math.round(state.objectiveDistance))} M`
      : '完成';

    if (state.checkpoint > this.previousCheckpoint) {
      this.toast.classList.add('show');
      this.toastTimer = 1.8;
      this.previousCheckpoint = state.checkpoint;
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= deltaTime;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
  }
}
