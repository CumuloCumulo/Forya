import * as THREE from 'three';

function seededNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createSurfaceTexture(kind: 'rock' | 'grass' | 'snow'): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  const random = seededNoise(kind === 'rock' ? 731 : kind === 'grass' ? 1907 : 4219);
  const palette = kind === 'rock'
    ? [92, 98, 96]
    : kind === 'grass'
      ? [54, 93, 53]
      : [224, 235, 235];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (x + y * size) * 4;
      const broad = Math.sin(x * 0.13) * 4 + Math.cos(y * 0.09) * 5;
      const grain = (random() - 0.5) * (kind === 'rock' ? 30 : kind === 'grass' ? 22 : 12);
      const strata = kind === 'rock' ? Math.sin((x + y * 0.22) * 0.34) * 7 : 0;
      image.data[index] = THREE.MathUtils.clamp(palette[0] + broad + grain + strata, 0, 255);
      image.data[index + 1] = THREE.MathUtils.clamp(palette[1] + broad + grain * 0.8 + strata, 0, 255);
      image.data[index + 2] = THREE.MathUtils.clamp(palette[2] + broad + grain * 0.62 + strata, 0, 255);
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  if (kind === 'rock') {
    context.globalAlpha = 0.24;
    context.strokeStyle = '#202729';
    context.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x = random() * size;
      const y = random() * size;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (random() - 0.5) * 24, y + 12 + random() * 30);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

const rockTexture = createSurfaceTexture('rock');
const grassTexture = createSurfaceTexture('grass');
const snowTexture = createSurfaceTexture('snow');

export function createTerrainMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    flatShading: false,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainRock = { value: rockTexture };
    shader.uniforms.terrainGrass = { value: grassTexture };
    shader.uniforms.terrainSnow = { value: snowTexture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTerrainWorldPosition;
        varying vec3 vTerrainWorldNormal;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTerrainWorldPosition;
        varying vec3 vTerrainWorldNormal;
        uniform sampler2D terrainRock;
        uniform sampler2D terrainGrass;
        uniform sampler2D terrainSnow;

        vec3 sampleTriplanar(sampler2D surfaceMap, vec3 position, vec3 normal, float scale) {
          vec3 blend = pow(abs(normal), vec3(4.0));
          blend /= max(blend.x + blend.y + blend.z, 0.0001);
          vec3 xProjection = texture2D(surfaceMap, position.yz * scale).rgb;
          vec3 yProjection = texture2D(surfaceMap, position.xz * scale).rgb;
          vec3 zProjection = texture2D(surfaceMap, position.xy * scale).rgb;
          return xProjection * blend.x + yProjection * blend.y + zProjection * blend.z;
        }

        float terrainHash(vec2 point) {
          return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
        }`)
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 terrainNormal = normalize(vTerrainWorldNormal);
        float slope = 1.0 - abs(terrainNormal.y);
        float height = vTerrainWorldPosition.y;
        float macroNoise = terrainHash(floor(vTerrainWorldPosition.xz * 0.08));

        vec3 rockFine = sampleTriplanar(terrainRock, vTerrainWorldPosition, terrainNormal, 0.105);
        vec3 rockBroad = sampleTriplanar(terrainRock, vTerrainWorldPosition, terrainNormal, 0.026);
        vec3 rockColor = mix(rockBroad, rockFine, 0.72);
        vec3 grassColor = sampleTriplanar(terrainGrass, vTerrainWorldPosition, terrainNormal, 0.12);
        vec3 snowColor = sampleTriplanar(terrainSnow, vTerrainWorldPosition, terrainNormal, 0.095);

        float rockWeight = smoothstep(0.22, 0.62, slope);
        float vegetationBand = smoothstep(-2.0, 10.0, height) * (1.0 - smoothstep(52.0, 80.0, height));
        float snowAltitude = smoothstep(67.0 + macroNoise * 11.0, 112.0 + macroNoise * 8.0, height);
        float snowSlope = 1.0 - smoothstep(0.36, 0.76, slope);
        float snowWeight = snowAltitude * snowSlope;
        float grassWeight = vegetationBand * (1.0 - smoothstep(0.18, 0.48, slope)) * (1.0 - snowWeight);

        vec3 terrainColor = rockColor;
        terrainColor = mix(terrainColor, grassColor, grassWeight);
        terrainColor = mix(terrainColor, snowColor, snowWeight);
        terrainColor *= 0.9 + macroNoise * 0.16;
        diffuseColor.rgb = terrainColor;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.82, 0.96, smoothstep(0.0, 0.7, slope));`);
  };
  material.customProgramCacheKey = () => 'forya-terrain-triplanar-v1';
  return material;
}
