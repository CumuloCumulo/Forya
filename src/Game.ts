import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld';
import { Player } from './Player';
import { WorldManager } from './terrain/WorldManager';
import { CameraManager } from './CameraManager';

export class Game {
  private scene: THREE.Scene;
  private renderer!: THREE.WebGLRenderer;
  private cameraManager: CameraManager;
  private camera: THREE.PerspectiveCamera;
  private physics: PhysicsWorld;
  private worldManager: WorldManager;
  private player: Player;
  private sunLight: THREE.DirectionalLight;
  private keys: Record<string, boolean>;
  private clock: THREE.Clock;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffd59e);
    this.scene.fog = new THREE.Fog(0xffd59e, 200, 480);

    this.setupRenderer();

    this.cameraManager = new CameraManager(this.renderer);
    this.camera = this.cameraManager.camera;

    this.physics = new PhysicsWorld();

    this.worldManager = new WorldManager(this.scene, this.physics);

    this.player = new Player(this.scene, this.physics);

    const initialH = this.worldManager.getHeightAt(0, 0);
    this.player.setPosition(0, initialH + 72, 0);

    this.sunLight = this.setupLights();

    this.keys = {};
    this.setupInput();

    window.addEventListener('resize', () => this.onResize());

    this.clock = new THREE.Clock();
  }

  private setupRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }

  private setupLights(): THREE.DirectionalLight {
    const ambientLight = new THREE.AmbientLight(0xffe0b2, 0.7);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffa000, 1.8);
    sunLight.position.set(50, 40, 30);
    sunLight.castShadow = true;

    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 200;
    const d = 80;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;

    this.scene.add(sunLight);
    this.scene.add(sunLight.target);

    const fillLight = new THREE.DirectionalLight(0xd1c4e9, 0.4);
    fillLight.position.set(-30, 20, -30);
    this.scene.add(fillLight);

    const hemiLight = new THREE.HemisphereLight(0xffe0b2, 0x8d6e63, 0.4);
    this.scene.add(hemiLight);

    return sunLight;
  }

  private setupInput(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.keys = {};
    });
  }

  private onResize(): void {
    this.cameraManager.onResize();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private update(deltaTime: number): void {
    const playerPos = this.player.getPosition();

    this.worldManager.update(playerPos, deltaTime);

    const moveDir = new THREE.Vector3();
    const forward = this.cameraManager.getForwardVector();
    const right = this.cameraManager.getRightVector();

    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveDir.add(forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveDir.sub(forward);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveDir.sub(right);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveDir.add(right);

    const isSprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    this.player.setSprinting(isSprinting);

    const isFlying = this.keys['Space'];
    this.player.setFlying(isFlying);

    this.player.move(moveDir, deltaTime);

    this.physics.update(deltaTime);

    this.player.emergencyGroundCheck(this.worldManager);

    this.player.update();
    this.player.updateTrail(deltaTime);

    this.sunLight.position.set(playerPos.x + 50, playerPos.y + 40, playerPos.z + 30);
    this.sunLight.target.position.set(playerPos.x, playerPos.y, playerPos.z);

    let turnFactor = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) turnFactor += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) turnFactor -= 1;

    this.cameraManager.update(playerPos, deltaTime, turnFactor);

    if (playerPos.y < -50) {
      this.respawnPlayer();
    }
  }

  private respawnPlayer(): void {
    console.log("跌落深渊，重生！");
    const h = this.worldManager.getHeightAt(0, 0);
    this.player.setPosition(0, h + 72, 0);
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private gameLoop(): void {
    const deltaTime = Math.min(this.clock.getDelta(), 0.1);
    this.update(deltaTime);
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }

  start(): void {
    console.log('🏔️ 山地探险 - 无限世界版启动！');
    console.log('点击屏幕锁定鼠标以旋转视角');
    console.log('按住 Space 飞行！');
    this.gameLoop();
  }
}
