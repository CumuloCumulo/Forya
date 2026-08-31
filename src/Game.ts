import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld';
import { Player } from './Player';
import { WorldManager } from './terrain/WorldManager';
import { CameraManager } from './CameraManager';
import { Environment } from './Environment';
import { RouteSystem } from './RouteSystem';
import { HUD } from './HUD';
import { FlightFeedback } from './FlightFeedback';
import type { GameMode } from './gameplay/GameMode';

export class Game {
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer;
  private cameraManager: CameraManager;
  private physics = new PhysicsWorld();
  private worldManager: WorldManager;
  private player: Player;
  private environment: Environment;
  private flightFeedback: FlightFeedback;
  private route: RouteSystem;
  private hud = new HUD();
  private keys: Record<string, boolean> = {};
  private timer = new THREE.Timer();
  private frameRequest = 0;
  private active = false;
  private mode: GameMode = 'free';
  private previewTime = 0;
  private previewFocus = new THREE.Vector3();

  constructor() {
    this.renderer = this.setupRenderer();
    this.cameraManager = new CameraManager(this.renderer);
    this.worldManager = new WorldManager(this.scene, this.physics);
    this.environment = new Environment(this.scene);
    this.flightFeedback = new FlightFeedback(this.scene);
    this.player = new Player(this.scene, this.physics);
    this.route = new RouteSystem(this.scene, this.worldManager);
    this.respawnPlayer();
    this.player.mesh.visible = false;
    this.previewFocus.set(0, this.worldManager.getHeightAt(90, 150) + 22, 150);
    this.setupInput();
    window.addEventListener('resize', this.onResize);
  }

  private setupRenderer(): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    return renderer;
  }

  private setupInput(): void {
    window.addEventListener('keydown', (event) => {
      this.keys[event.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      if (event.code === 'KeyR') this.restartSession();
    });
    window.addEventListener('keyup', (event) => { this.keys[event.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
  }

  private onResize = (): void => {
    this.cameraManager.onResize();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  };

  private update(deltaTime: number): void {
    const beforePhysics = this.player.getPosition();
    this.worldManager.update(beforePhysics, deltaTime);

    const moveDirection = new THREE.Vector3();
    const forward = this.cameraManager.getForwardVector();
    const right = this.cameraManager.getRightVector();
    if (this.keys.KeyW || this.keys.ArrowUp) moveDirection.add(forward);
    if (this.keys.KeyS || this.keys.ArrowDown) moveDirection.sub(forward);
    if (this.keys.KeyA || this.keys.ArrowLeft) moveDirection.sub(right);
    if (this.keys.KeyD || this.keys.ArrowRight) moveDirection.add(right);

    this.player.setSprinting(Boolean(this.keys.ShiftLeft || this.keys.ShiftRight));
    this.player.setFlying(Boolean(this.keys.Space));
    this.player.move(moveDirection, deltaTime);
    this.physics.update(deltaTime);
    const terrain = this.player.emergencyGroundCheck(this.worldManager);
    const waterContact = this.player.handleWaterSurface(terrain);
    this.player.update();
    this.player.updateTrail(deltaTime);

    const position = this.player.getPosition();
    const velocity = this.player.getVelocity();
    const speedKmh = this.player.getSpeedKmh();
    const checkpointPassed = this.route.update(position, deltaTime);
    if (checkpointPassed) this.player.restoreFlightEnergy();
    const waterSkim = this.flightFeedback.update({ position, velocity, terrainHeight: terrain, speedKmh, waterContact }, deltaTime);
    this.environment.update(position, deltaTime);
    this.cameraManager.update(
      position,
      velocity,
      deltaTime,
      this.player.getTurnAmount(),
      (x, z) => this.worldManager.getHeightAt(x, z),
    );
    this.hud.update({
      speedKmh,
      altitude: position.y,
      verticalSpeed: velocity.y,
      flightEnergy: this.player.getFlightEnergy(),
      mode: this.mode,
      waterSkim,
      checkpoint: this.route.getProgress(),
      checkpointTotal: this.route.getTotal(),
      nextCheckpoint: this.route.getNextSequence(),
      objectiveDistance: this.route.getDistance(position),
    }, deltaTime);

    if (position.y < terrain - 20 || position.y < -220) this.respawnPlayer();
  }

  private restartSession(): void {
    if (this.mode === 'checkpoint') this.route.restart();
    this.player.restoreFlightEnergy();
    this.respawnPlayer();
  }

  private respawnPlayer(): void {
    const terrain = this.worldManager.getHeightAt(0, 0);
    this.player.setPosition(0, terrain + 82, 0);
  }

  private loop = (): void => {
    this.timer.update();
    const deltaTime = Math.min(this.timer.getDelta(), 0.05);
    if (this.active) this.update(deltaTime);
    else this.updatePreview(deltaTime);
    this.renderer.render(this.scene, this.cameraManager.camera);
    this.frameRequest = requestAnimationFrame(this.loop);
  };

  start(): void {
    if (this.frameRequest) return;
    this.timer.reset();
    this.frameRequest = requestAnimationFrame(this.loop);
  }

  activate(mode: GameMode): void {
    if (this.active) return;
    this.active = true;
    this.mode = mode;
    this.route.setMode(mode);
    this.player.setFlightEnergyLimited(mode === 'checkpoint');
    this.player.mesh.visible = true;
    this.respawnPlayer();
    this.cameraManager.reset();
  }

  private updatePreview(deltaTime: number): void {
    this.previewTime += deltaTime;
    this.worldManager.update(this.previewFocus, deltaTime);
    this.environment.update(this.previewFocus, deltaTime);
    this.cameraManager.updateCinematic(this.previewFocus, this.previewTime);
  }
}
