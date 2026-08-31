import type { GameMode } from './gameplay/GameMode';
import { calculateSpeedRush } from './gameplay/FlightFeedbackMath';
import { formatCheckpointProgress } from './gameplay/GameplayPresentation';

export interface HUDState {
  speedKmh: number;
  altitude: number;
  verticalSpeed: number;
  flightEnergy: number;
  mode: GameMode;
  waterSkim: number;
  checkpoint: number;
  checkpointTotal: number | null;
  nextCheckpoint: number;
  objectiveDistance: number;
}

export class HUD {
  private speed = document.getElementById('speed-value')!;
  private altitude = document.getElementById('altitude-value')!;
  private verticalSpeed = document.getElementById('vertical-value')!;
  private routeState = document.getElementById('route-state')!;
  private routeLabel = document.getElementById('route-label')!;
  private objective = document.getElementById('objective')!;
  private objectiveIndex = document.getElementById('objective-index')!;
  private energyPanel = document.getElementById('energy-panel')!;
  private energy = document.getElementById('energy-fill')! as HTMLElement;
  private speedLines = document.getElementById('speed-lines')!;
  private waterSkim = document.getElementById('water-skim-vignette')!;
  private checkpoint = document.getElementById('checkpoint-current')!;
  private checkpointTotal = document.getElementById('checkpoint-total')!;
  private objectiveDistance = document.getElementById('objective-distance')!;
  private toast = document.getElementById('toast')!;
  private toastTimer = 0;
  private previousCheckpoint = 0;
  private previousMode: GameMode | null = null;

  constructor() {
    for (let index = 0; index < 44; index++) {
      const streak = document.createElement('i');
      streak.style.setProperty('--angle', `${(index / 44) * 360 + (index % 3) * 1.8}deg`);
      streak.style.setProperty('--delay', `${-(index % 11) * 0.052}s`);
      streak.style.setProperty('--length', `${0.72 + (index % 6) * 0.14}`);
      this.speedLines.appendChild(streak);
    }
  }

  update(state: HUDState, deltaTime: number): void {
    this.speed.textContent = Math.round(state.speedKmh).toString().padStart(3, '0');
    this.altitude.textContent = `${Math.max(0, Math.round(state.altitude)).toString().padStart(4, '0')} M`;
    const verticalDirection = state.verticalSpeed > 0.5 ? '↑' : state.verticalSpeed < -0.5 ? '↓' : '—';
    this.verticalSpeed.textContent = `${verticalDirection} ${Math.abs(state.verticalSpeed).toFixed(1)} M/S`;
    this.verticalSpeed.classList.toggle('climbing', state.verticalSpeed > 0.5);
    const speedRush = calculateSpeedRush(state.speedKmh);
    this.speedLines.style.setProperty('--rush', speedRush.toFixed(3));
    this.speedLines.style.setProperty('--rush-speed', `${Math.max(0.17, 0.52 - speedRush * 0.31)}s`);
    this.speedLines.classList.toggle('active', speedRush > 0.02);
    this.waterSkim.style.opacity = state.waterSkim.toFixed(3);

    if (state.mode !== this.previousMode) {
      this.previousMode = state.mode;
      this.previousCheckpoint = state.checkpoint;
      this.routeState.classList.toggle('free', state.mode === 'free');
      this.objective.classList.toggle('mode-hidden', state.mode === 'free');
      this.energyPanel.classList.toggle('mode-hidden', state.mode === 'free');
      this.routeLabel.textContent = state.mode === 'free' ? '自由飞行 / 无限上升' : '无尽续航航标';
    }

    this.energy.style.transform = `scaleX(${Math.max(0, Math.min(1, state.flightEnergy))})`;
    this.energyPanel.classList.toggle('low', state.flightEnergy < 0.22);
    const progress = formatCheckpointProgress(state.checkpoint, state.checkpointTotal);
    this.checkpoint.textContent = progress.current;
    this.checkpointTotal.textContent = progress.total;
    this.objectiveIndex.textContent = state.nextCheckpoint.toString().padStart(2, '0');
    this.objectiveDistance.textContent = Number.isFinite(state.objectiveDistance)
      ? `${Math.max(0, Math.round(state.objectiveDistance))} M`
      : '完成';

    if (state.checkpoint < this.previousCheckpoint) this.previousCheckpoint = state.checkpoint;
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
