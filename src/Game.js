import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld.js';
import { Player } from './Player.js';
import { WorldManager } from './world/WorldManager.js';
import { CameraManager } from './CameraManager.js';

export class Game {
  constructor() {
    // 初始化 Three.js 场景
    this.scene = new THREE.Scene();
    
    // 氛围感背景色 - 暖色调黄昏
    this.scene.background = new THREE.Color(0xffd59e);
    
    // 高级雾效 - 暖色雾气
    // 调整雾效以配合新的渲染距离 (480m 左右)
    // 雾气开始于 200，完全遮挡于 450，平滑隐藏加载边缘
    this.scene.fog = new THREE.Fog(0xffd59e, 200, 480); 
    
    // 设置渲染器 (放在最前，因为 CameraManager 需要 canvas 绑定事件)
    this.setupRenderer();
    
    // 初始化相机管理器
    this.cameraManager = new CameraManager(this.renderer);
    this.camera = this.cameraManager.camera;
    
    // 初始化物理世界
    this.physics = new PhysicsWorld();
    
    // 初始化世界管理器 (无限地形)
    this.worldManager = new WorldManager(this.scene, this.physics);
    
    // 创建玩家 - 初始位置设为高空，让它落到地面
    this.player = new Player(this.scene, this.physics);
    
    // 确保玩家在地面上方
    const initialH = this.worldManager.getHeightAt(0, 0);
    // 将玩家放置在塔顶 (塔高 80, 偏移 -10, 平台顶部约 +70 + 2(玩家高度缓冲))
    this.player.setPosition(0, initialH + 72, 0);

    // 设置场景灯光
    this.setupLights();
    
    // 输入状态
    this.keys = {};
    this.setupInput();
    
    // 窗口大小调整监听
    window.addEventListener('resize', () => this.onResize());
    
    // 射线检测器 (用于调试或其他)
    this.raycaster = new THREE.Raycaster();
    
    // 初始化时钟
    this.clock = new THREE.Clock();
  }
  
  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('game-canvas'),
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // 高级阴影设置
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // 电影级色调映射
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }
  
  setupLights() {
    // 环境光 - 温暖的琥珀色填充
    const ambientLight = new THREE.AmbientLight(0xffe0b2, 0.7);
    this.scene.add(ambientLight);
    
    // 主光源 - 强烈的夕阳金光
    const sunLight = new THREE.DirectionalLight(0xffa000, 1.8);
    sunLight.position.set(50, 40, 30); // 降低光源高度，制造长投影
    sunLight.castShadow = true;
    
    // 优化阴影质量
    sunLight.shadow.mapSize.width = 2048; // 4096 -> 2048 性能优化
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 600; 
    const d = 250; 
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    
    this.scene.add(sunLight);
    
    // 辅助光 - 紫色/粉色反光，增强夕阳氛围
    const fillLight = new THREE.DirectionalLight(0xd1c4e9, 0.4);
    fillLight.position.set(-30, 20, -30);
    this.scene.add(fillLight);
    
    // 额外添加一个暖色半球光，模拟天空和地面的反光
    const hemiLight = new THREE.HemisphereLight(0xffe0b2, 0x8d6e63, 0.4);
    this.scene.add(hemiLight);
  }
  
  setupInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    
    window.addEventListener('blur', () => {
      this.keys = {};
    });
  }
  
  onResize() {
    this.cameraManager.onResize();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  update(deltaTime) {
    const playerPos = this.player.getPosition();
    
    // 1. 更新无限世界 (生成/销毁地形)
    this.worldManager.update(playerPos);
    
    // 3. 处理玩家输入 (基于相机视角)
    const moveDir = new THREE.Vector3();
    const forward = this.cameraManager.getForwardVector();
    const right = this.cameraManager.getRightVector();
    
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveDir.add(forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveDir.sub(forward);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveDir.sub(right);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveDir.add(right);
    
    const isSprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    this.player.setSprinting(isSprinting);
    
    // 飞行控制 (空格键)
    const isFlying = this.keys['Space'];
    this.player.setFlying(isFlying);
    
    // 4. 更新玩家物理与逻辑
    this.player.move(moveDir, deltaTime);
    
    // 5. 物理模拟
    this.physics.update(deltaTime);
    
    // 6. 同步玩家视觉
    this.player.update();

    // 2. 相机更新 (在玩家位置更新后执行，确保相机跟随最新位置，消除抖动)
    let turnFactor = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) turnFactor += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) turnFactor -= 1;
    
    this.cameraManager.update(playerPos, deltaTime, turnFactor);
    
    // 检查掉落
    if (playerPos.y < -50) {
      this.respawnPlayer();
    }
  }
  
  respawnPlayer() {
    console.log("跌落深渊，重生！");
    const h = this.worldManager.getHeightAt(0, 0);
    // 重生回塔顶
    this.player.setPosition(0, h + 72, 0);
  }
  
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  
  gameLoop() {
    const deltaTime = Math.min(this.clock.getDelta(), 0.1);
    this.update(deltaTime);
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }
  
  start() {
    console.log('🏔️ 山地探险 - 无限世界版启动！');
    console.log('点击屏幕锁定鼠标以旋转视角');
    console.log('按住 Space 飞行！');
    this.gameLoop();
  }
}
