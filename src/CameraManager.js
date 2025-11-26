import * as THREE from 'three';

export class CameraManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    
    // 创建透视相机
    const aspect = window.innerWidth / window.innerHeight;
    // FOV (视野角度) 从 60 增加到 90，提供更广阔的视野
    this.camera = new THREE.PerspectiveCamera(90, aspect, 0.1, 2000);
    
    // 初始参数
    this.distance = 12;     // 距离玩家的距离
    this.heightOffset = 4;  // 观察点高度（头顶上方）
    
    // 旋转角度 (球坐标系)
    // theta: 水平角度 (0-2PI)
    // phi: 垂直角度 (0-PI, 0是正上方)
    this.theta = Math.PI;       // 初始背对玩家
    this.phi = Math.PI / 2.5;   // 初始稍微俯视
    
    // 限制
    this.minPhi = 0.1;              // 防止完全垂直向上
    this.maxPhi = Math.PI / 2 - 0.1; // 防止钻入地下
    this.minDistance = 5;
    this.maxDistance = 60; // 允许拉远更多，欣赏风景
    
    this.sensitivity = 0.002;
    
    // 相机侧倾 (Roll)
    this.currentRoll = 0;
    this.targetRoll = 0;
    
    // 鼠标锁定状态
    this.isLocked = false;
    
    this.setupInputs();
  }
  
  setupInputs() {
    // 监听鼠标移动
    document.addEventListener('mousemove', (e) => {
      if (this.isLocked) {
        // 更新角度
        // movementX > 0 (向右动) -> 视角向右转 -> theta 减小 (Three.js 坐标系)
        this.theta -= e.movementX * this.sensitivity;
        this.phi -= e.movementY * this.sensitivity;
        
        // 限制垂直角度
        this.phi = Math.max(this.minPhi, Math.min(this.maxPhi, this.phi));
      }
    });
    
    // 滚轮缩放距离
    document.addEventListener('wheel', (e) => {
      if (this.isLocked) {
        this.distance += e.deltaY * 0.01;
        this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
      }
    });
    
    // 监听指针锁定状态变化
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
    });
    
    // 点击画布请求锁定
    this.canvas.addEventListener('click', () => {
      if (!this.isLocked) {
        this.canvas.requestPointerLock();
      }
    });
  }
  
  update(playerPos, deltaTime, turnFactor = 0) {
    if (!playerPos) return;
    
    // 1. 计算目标观察点 (玩家位置 + 高度偏移)
    const target = new THREE.Vector3(playerPos.x, playerPos.y + this.heightOffset, playerPos.z);
    
    // 2. 根据球坐标计算相机位置偏移
    const x = this.distance * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.distance * Math.cos(this.phi);
    const z = this.distance * Math.sin(this.phi) * Math.cos(this.theta);
    
    // 3. 计算理想的相机位置
    const desiredPos = target.clone().add(new THREE.Vector3(x, y, z));
    
    // 4. 简单的相机碰撞检测 (防止穿墙)
    // 从目标点向相机发射射线
    const dir = desiredPos.clone().sub(target).normalize();
    // 简单起见，这里暂时只做简单的平滑移动，真正的相机碰撞需要检测地形
    
    // 5. 平滑插值更新相机位置 (增加跟随的重量感)
    const lerpFactor = 15 * deltaTime; 
    this.camera.position.lerp(desiredPos, lerpFactor);
    
    // 6. 计算目标旋转四元数 (替代直接 lookAt)
    // 我们需要计算"如果相机看向目标，它应该是什姿态"
    const targetQuaternion = new THREE.Quaternion();
    const rotationMatrix = new THREE.Matrix4();
    
    // 使用矩阵计算从当前位置看向目标的旋转
    // 注意: lookAt 函数参数是 (eye, target, up)
    rotationMatrix.lookAt(this.camera.position, target, new THREE.Vector3(0, 1, 0));
    targetQuaternion.setFromRotationMatrix(rotationMatrix);

    // 7. 处理相机侧倾 (Roll)
    // turnFactor: -1 (右转), 0 (直行), 1 (左转)
    const maxRoll = 0.3; 
    this.targetRoll = -turnFactor * maxRoll;
    
    // 平滑插值 Roll 值
    this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.targetRoll, 5 * deltaTime);
    
    // 将 Roll 叠加到目标四元数上 (绕局部 Z 轴)
    const rollQuat = new THREE.Quaternion();
    rollQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.currentRoll);
    targetQuaternion.multiply(rollQuat);

    // 8. 应用旋转 (Slerp 平滑插值)
    // 如果角度差异过大（如初始化时），直接对齐，避免"看不到画面"的情况
    if (this.camera.quaternion.angleTo(targetQuaternion) > 1.0) {
        this.camera.quaternion.copy(targetQuaternion);
    } else {
        // 使用 Slerp 平滑过渡，过滤掉高频抖动
        const rotLerpFactor = 15 * deltaTime;
        this.camera.quaternion.slerp(targetQuaternion, rotLerpFactor);
    }
  }
  
  /**
   * 获取相机当前的水平前方向量 (用于控制玩家移动方向)
   */
  getForwardVector() {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0; // 忽略垂直分量
    forward.normalize();
    return forward;
  }
  
  /**
   * 获取相机当前的水平右侧向量
   */
  getRightVector() {
    const forward = this.getForwardVector();
    // 向量叉乘: Up(0,1,0) x Forward -> Right
    // 或者简单交换坐标: (-z, 0, x) 
    return new THREE.Vector3(-forward.z, 0, forward.x);
  }
  
  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}

