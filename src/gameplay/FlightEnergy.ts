export class FlightEnergy {
  private value = 1;
  private limited = false;

  setLimited(limited: boolean): void {
    this.limited = limited;
    this.value = 1;
  }

  canClimb(): boolean {
    return !this.limited || this.value > 0.001;
  }

  consumeClimb(deltaTime: number): void {
    if (!this.limited) return;
    this.value = Math.max(0, this.value - Math.max(0, deltaTime) * 0.14);
  }

  restore(): void {
    this.value = 1;
  }

  getValue(): number {
    return this.limited ? this.value : 1;
  }
}

