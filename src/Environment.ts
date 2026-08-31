import * as THREE from 'three';

export class Environment {
  readonly sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private sunDisk: THREE.Sprite;
  private water: THREE.Mesh;
  private waterMaterial: THREE.MeshPhysicalMaterial;
  private elapsed = 0;
  private target = new THREE.Object3D();

  constructor(private scene: THREE.Scene) {
    scene.background = new THREE.Color(0x8bbbd1);
    scene.fog = new THREE.FogExp2(0x9bbcc8, 0.00055);

    const skyGeometry = new THREE.SphereGeometry(1100, 40, 20);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x173c58) },
        horizonColor: { value: new THREE.Color(0xb8d7dc) },
        groundColor: { value: new THREE.Color(0xd9c5ad) },
        sunDirection: { value: new THREE.Vector3(-0.52, 0.46, -0.7).normalize() },
      },
      vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 worldPosition=modelMatrix*vec4(position,1.0); vWorldPosition=worldPosition.xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vWorldPosition;
        uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 groundColor; uniform vec3 sunDirection;
        void main(){
          vec3 d=normalize(vWorldPosition-cameraPosition);
          float h=smoothstep(-0.12,0.55,d.y);
          vec3 color=mix(groundColor,horizonColor,smoothstep(-0.18,0.05,d.y));
          color=mix(color,topColor,h);
          float sun=pow(max(dot(d,sunDirection),0.0),350.0);
          float haze=pow(max(dot(d,sunDirection),0.0),8.0)*0.22;
          color+=vec3(1.0,.72,.38)*sun*2.3+vec3(1.0,.55,.25)*haze;
          gl_FragColor=vec4(color,1.0);
        }`,
    });
    this.sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10000;
    skyMaterial.depthTest = false;
    scene.add(this.sky);

    const hemi = new THREE.HemisphereLight(0xc9edff, 0x283129, 1.65);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xb9d4df, 0.26);
    scene.add(ambient);

    this.sun = new THREE.DirectionalLight(0xffd2a1, 4.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 330;
    this.sun.shadow.camera.left = -95;
    this.sun.shadow.camera.right = 95;
    this.sun.shadow.camera.top = 95;
    this.sun.shadow.camera.bottom = -95;
    this.sun.shadow.bias = -0.00018;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun, this.target);
    this.sun.target = this.target;

    const sunCanvas = document.createElement('canvas');
    sunCanvas.width = sunCanvas.height = 128;
    const ctx = sunCanvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,245,210,1)');
    gradient.addColorStop(.13, 'rgba(255,215,145,.98)');
    gradient.addColorStop(.35, 'rgba(255,176,93,.24)');
    gradient.addColorStop(1, 'rgba(255,150,75,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(sunCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.sunDisk = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sunDisk.scale.setScalar(115);
    scene.add(this.sunDisk);

    this.waterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1e6072,
      roughness: 0.22,
      metalness: 0.05,
      clearcoat: 0.72,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.8,
    });
    this.waterMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.waterTime = { value: 0 };
      this.waterMaterial.userData.shader = shader;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float waterTime;')
        .replace('#include <begin_vertex>', `
          vec3 transformed = vec3(position);
          transformed.z += sin(position.x * 0.018 + waterTime * 0.7) * 0.32;
          transformed.z += cos(position.y * 0.025 - waterTime * 0.52) * 0.2;
          transformed.z += sin((position.x + position.y) * 0.055 + waterTime) * 0.08;
        `);
    };
    this.waterMaterial.customProgramCacheKey = () => 'forya-water-v1';
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 128, 128), this.waterMaterial);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -8;
    this.water.receiveShadow = true;
    scene.add(this.water);
  }

  update(focus: THREE.Vector3, deltaTime = 0): void {
    this.elapsed += deltaTime;
    this.sky.position.copy(focus);
    this.sun.position.set(focus.x - 150, focus.y + 125, focus.z - 210);
    this.target.position.copy(focus);
    this.sunDisk.position.set(focus.x - 520, focus.y + 460, focus.z - 700);
    this.water.position.x = Math.round(focus.x / 200) * 200;
    this.water.position.z = Math.round(focus.z / 200) * 200;
    const shader = this.waterMaterial.userData.shader as { uniforms?: { waterTime?: { value: number } } } | undefined;
    if (shader?.uniforms?.waterTime) shader.uniforms.waterTime.value = this.elapsed;
  }
}
