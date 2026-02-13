import { FC, useRef, useState, useEffect, MutableRefObject, MouseEvent, KeyboardEvent, useCallback } from 'react';
import { mat4, quat, vec2, vec3 } from 'gl-matrix';

const discVertShaderSource = `#version 300 es

uniform mat4 uWorldMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec3 uCameraPosition;
uniform vec4 uRotationAxisVelocity;

in vec3 aModelPosition;
in vec3 aModelNormal;
in vec2 aModelUvs;
in mat4 aInstanceMatrix;

out vec2 vUvs;
out float vAlpha;
flat out int vInstanceId;

#define PI 3.141593

void main() {
    vec4 worldPosition = uWorldMatrix * aInstanceMatrix * vec4(aModelPosition, 1.);

    vec3 centerPos = (uWorldMatrix * aInstanceMatrix * vec4(0., 0., 0., 1.)).xyz;
    float radius = length(centerPos.xyz);

    if (gl_VertexID > 0) {
        vec3 rotationAxis = uRotationAxisVelocity.xyz;
        float rotationVelocity = min(.15, uRotationAxisVelocity.w * 15.);
        vec3 stretchDir = normalize(cross(centerPos, rotationAxis));
        vec3 relativeVertexPos = normalize(worldPosition.xyz - centerPos);
        float strength = dot(stretchDir, relativeVertexPos);
        float invAbsStrength = min(0., abs(strength) - 1.);
        strength = rotationVelocity * sign(strength) * abs(invAbsStrength * invAbsStrength * invAbsStrength + 1.);
        worldPosition.xyz += stretchDir * strength;
    }

    worldPosition.xyz = radius * normalize(worldPosition.xyz);

    gl_Position = uProjectionMatrix * uViewMatrix * worldPosition;

    vAlpha = smoothstep(0.5, 1., normalize(worldPosition.xyz).z) * .9 + .1;
    vUvs = aModelUvs;
    vInstanceId = gl_InstanceID;
}
`;

const discFragShaderSource = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform int uItemCount;
uniform int uAtlasSize;

out vec4 outColor;

in vec2 vUvs;
in float vAlpha;
flat in int vInstanceId;

void main() {
    int itemIndex = vInstanceId % uItemCount;
    int cellsPerRow = uAtlasSize;
    int cellX = itemIndex % cellsPerRow;
    int cellY = itemIndex / cellsPerRow;
    vec2 cellSize = vec2(1.0) / vec2(float(cellsPerRow));
    vec2 cellOffset = vec2(float(cellX), float(cellY)) * cellSize;

    ivec2 texSize = textureSize(uTex, 0);
    float imageAspect = float(texSize.x) / float(texSize.y);
    float containerAspect = 1.0;
    
    float scale = max(imageAspect / containerAspect, 
                     containerAspect / imageAspect);
    
    vec2 st = vec2(vUvs.x, 1.0 - vUvs.y);
    st = (st - 0.5) * scale + 0.5;
    
    st = clamp(st, 0.0, 1.0);
    st = st * cellSize + cellOffset;
    
    outColor = texture(uTex, st);
    outColor.a *= vAlpha;
}
`;

class Face {
  public a: number;
  public b: number;
  public c: number;

  constructor(a: number, b: number, c: number) {
    this.a = a;
    this.b = b;
    this.c = c;
  }
}

class Vertex {
  public position: vec3;
  public normal: vec3;
  public uv: vec2;

  constructor(x: number, y: number, z: number) {
    this.position = vec3.fromValues(x, y, z);
    this.normal = vec3.create();
    this.uv = vec2.create();
  }
}

class Geometry {
  public vertices: Vertex[];
  public faces: Face[];

  constructor() {
    this.vertices = [];
    this.faces = [];
  }

  public addVertex(...args: number[]): this {
    for (let i = 0; i < args.length; i += 3) {
      this.vertices.push(new Vertex(args[i], args[i + 1], args[i + 2]));
    }
    return this;
  }

  public addFace(...args: number[]): this {
    for (let i = 0; i < args.length; i += 3) {
      this.faces.push(new Face(args[i], args[i + 1], args[i + 2]));
    }
    return this;
  }

  public get lastVertex(): Vertex {
    return this.vertices[this.vertices.length - 1];
  }

  public subdivide(divisions = 1): this {
    const midPointCache: Record<string, number> = {};
    let f = this.faces;

    for (let div = 0; div < divisions; ++div) {
      const newFaces = new Array<Face>(f.length * 4);

      f.forEach((face, ndx) => {
        const mAB = this.getMidPoint(face.a, face.b, midPointCache);
        const mBC = this.getMidPoint(face.b, face.c, midPointCache);
        const mCA = this.getMidPoint(face.c, face.a, midPointCache);

        const i = ndx * 4;
        newFaces[i + 0] = new Face(face.a, mAB, mCA);
        newFaces[i + 1] = new Face(face.b, mBC, mAB);
        newFaces[i + 2] = new Face(face.c, mCA, mBC);
        newFaces[i + 3] = new Face(mAB, mBC, mCA);
      });

      f = newFaces;
    }

    this.faces = f;
    return this;
  }

  public spherize(radius = 1): this {
    this.vertices.forEach(vertex => {
      vec3.normalize(vertex.normal, vertex.position);
      vec3.scale(vertex.position, vertex.normal, radius);
    });
    return this;
  }

  public get data(): {
    vertices: Float32Array;
    indices: Uint16Array;
    normals: Float32Array;
    uvs: Float32Array;
  } {
    return {
      vertices: this.vertexData,
      indices: this.indexData,
      normals: this.normalData,
      uvs: this.uvData
    };
  }

  public get vertexData(): Float32Array {
    return new Float32Array(this.vertices.flatMap(v => Array.from(v.position)));
  }

  public get normalData(): Float32Array {
    return new Float32Array(this.vertices.flatMap(v => Array.from(v.normal)));
  }

  public get uvData(): Float32Array {
    return new Float32Array(this.vertices.flatMap(v => Array.from(v.uv)));
  }

  public get indexData(): Uint16Array {
    return new Uint16Array(this.faces.flatMap(f => [f.a, f.b, f.c]));
  }

  public getMidPoint(ndxA: number, ndxB: number, cache: Record<string, number>): number {
    const cacheKey = ndxA < ndxB ? `k_${ndxB}_${ndxA}` : `k_${ndxA}_${ndxB}`;
    if (Object.prototype.hasOwnProperty.call(cache, cacheKey)) {
      return cache[cacheKey];
    }
    const a = this.vertices[ndxA].position;
    const b = this.vertices[ndxB].position;
    const ndx = this.vertices.length;
    cache[cacheKey] = ndx;
    this.addVertex((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5);
    return ndx;
  }
}

class IcosahedronGeometry extends Geometry {
  constructor() {
    super();
    const t = Math.sqrt(5) * 0.5 + 0.5;
    this.addVertex(
      -1,
      t,
      0,
      1,
      t,
      0,
      -1,
      -t,
      0,
      1,
      -t,
      0,
      0,
      -1,
      t,
      0,
      1,
      t,
      0,
      -1,
      -t,
      0,
      1,
      -t,
      t,
      0,
      -1,
      t,
      0,
      1,
      -t,
      0,
      -1,
      -t,
      0,
      1
    ).addFace(
      0,
      11,
      5,
      0,
      5,
      1,
      0,
      1,
      7,
      0,
      7,
      10,
      0,
      10,
      11,
      1,
      5,
      9,
      5,
      11,
      4,
      11,
      10,
      2,
      10,
      7,
      6,
      7,
      1,
      8,
      3,
      9,
      4,
      3,
      4,
      2,
      3,
      2,
      6,
      3,
      6,
      8,
      3,
      8,
      9,
      4,
      9,
      5,
      2,
      4,
      11,
      6,
      2,
      10,
      8,
      6,
      7,
      9,
      8,
      1
    );
  }
}

class DiscGeometry extends Geometry {
  constructor(steps = 4, radius = 1) {
    super();
    const safeSteps = Math.max(4, steps);
    const alpha = (2 * Math.PI) / safeSteps;

    this.addVertex(0, 0, 0);
    this.lastVertex.uv[0] = 0.5;
    this.lastVertex.uv[1] = 0.5;

    for (let i = 0; i < safeSteps; ++i) {
      const x = Math.cos(alpha * i);
      const y = Math.sin(alpha * i);
      this.addVertex(radius * x, radius * y, 0);
      this.lastVertex.uv[0] = x * 0.5 + 0.5;
      this.lastVertex.uv[1] = y * 0.5 + 0.5;

      if (i > 0) {
        this.addFace(0, i, i + 1);
      }
    }
    this.addFace(0, safeSteps, 1);
  }
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);

  if (success) {
    return shader;
  }

  console.error(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function createProgram(
  gl: WebGL2RenderingContext,
  shaderSources: [string, string],
  transformFeedbackVaryings?: string[] | null,
  attribLocations?: Record<string, number>
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;

  [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].forEach((type, ndx) => {
    const shader = createShader(gl, type, shaderSources[ndx]);
    if (shader) {
      gl.attachShader(program, shader);
    }
  });

  if (transformFeedbackVaryings) {
    gl.transformFeedbackVaryings(program, transformFeedbackVaryings, gl.SEPARATE_ATTRIBS);
  }

  if (attribLocations) {
    for (const attrib in attribLocations) {
      if (Object.prototype.hasOwnProperty.call(attribLocations, attrib)) {
        gl.bindAttribLocation(program, attribLocations[attrib], attrib);
      }
    }
  }

  gl.linkProgram(program);
  const success = gl.getProgramParameter(program, gl.LINK_STATUS);

  if (success) {
    return program;
  }

  console.error(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
}

function makeVertexArray(
  gl: WebGL2RenderingContext,
  bufLocNumElmPairs: Array<[WebGLBuffer, number, number]>,
  indices?: Uint16Array
): WebGLVertexArrayObject | null {
  const va = gl.createVertexArray();
  if (!va) return null;

  gl.bindVertexArray(va);

  for (const [buffer, loc, numElem] of bufLocNumElmPairs) {
    if (loc === -1) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, numElem, gl.FLOAT, false, 0, 0);
  }

  if (indices) {
    const indexBuffer = gl.createBuffer();
    if (indexBuffer) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    }
  }

  gl.bindVertexArray(null);
  return va;
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement): boolean {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const displayWidth = Math.round(canvas.clientWidth * dpr);
  const displayHeight = Math.round(canvas.clientHeight * dpr);
  const needResize = canvas.width !== displayWidth || canvas.height !== displayHeight;
  if (needResize) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
  return needResize;
}

function makeBuffer(gl: WebGL2RenderingContext, sizeOrData: number | ArrayBufferView, usage: number): WebGLBuffer {
  const buf = gl.createBuffer();
  if (!buf) {
    throw new Error('Failed to create WebGL buffer.');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);

  if (typeof sizeOrData === 'number') {
    gl.bufferData(gl.ARRAY_BUFFER, sizeOrData, usage);
  } else {
    gl.bufferData(gl.ARRAY_BUFFER, sizeOrData, usage);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buf;
}

function createAndSetupTexture(
  gl: WebGL2RenderingContext,
  minFilter: number,
  magFilter: number,
  wrapS: number,
  wrapT: number
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error('Failed to create WebGL texture.');
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
  return texture;
}

type UpdateCallback = (deltaTime: number) => void;

class ArcballControl {
  private canvas: HTMLCanvasElement;
  private updateCallback: UpdateCallback;

  public isPointerDown = false;
  public orientation = quat.create();
  public pointerRotation = quat.create();
  public rotationVelocity = 0;
  public rotationAxis = vec3.fromValues(1, 0, 0);

  public snapDirection = vec3.fromValues(0, 0, -1);
  public snapTargetDirection: vec3 | null = null;

  private pointerPos = vec2.create();
  private previousPointerPos = vec2.create();
  private _rotationVelocity = 0;
  private _combinedQuat = quat.create();
  private pointerDownHandler: (e: PointerEvent) => void;
  private pointerUpHandler: () => void;
  private pointerLeaveHandler: () => void;
  private pointerMoveHandler: (e: PointerEvent) => void;

  private readonly EPSILON = 0.1;
  private readonly IDENTITY_QUAT = quat.create();

  constructor(canvas: HTMLCanvasElement, updateCallback?: UpdateCallback) {
    this.canvas = canvas;
    this.updateCallback = updateCallback || (() => undefined);

    this.pointerDownHandler = (e: PointerEvent) => {
      vec2.set(this.pointerPos, e.clientX, e.clientY);
      vec2.copy(this.previousPointerPos, this.pointerPos);
      this.isPointerDown = true;
      // 重置旋转速度,避免突变
      this._rotationVelocity = 0;
    };
    this.pointerUpHandler = () => {
      this.isPointerDown = false;
    };
    this.pointerLeaveHandler = () => {
      this.isPointerDown = false;
    };
    this.pointerMoveHandler = (e: PointerEvent) => {
      if (this.isPointerDown) {
        const newX = e.clientX;
        const newY = e.clientY;
        
        // 限制单帧最大移动距离,避免快速滑动时产生镜像
        const MAX_DELTA = 100;
        const deltaX = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, newX - this.pointerPos[0]));
        const deltaY = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, newY - this.pointerPos[1]));
        
        vec2.set(this.pointerPos, this.pointerPos[0] + deltaX, this.pointerPos[1] + deltaY);
      }
    };

    canvas.addEventListener('pointerdown', this.pointerDownHandler);
    canvas.addEventListener('pointerup', this.pointerUpHandler);
    canvas.addEventListener('pointerleave', this.pointerLeaveHandler);
    canvas.addEventListener('pointermove', this.pointerMoveHandler);
    canvas.style.touchAction = 'none';
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.pointerDownHandler);
    this.canvas.removeEventListener('pointerup', this.pointerUpHandler);
    this.canvas.removeEventListener('pointerleave', this.pointerLeaveHandler);
    this.canvas.removeEventListener('pointermove', this.pointerMoveHandler);
  }

  public update(deltaTime: number, targetFrameDuration = 16): void {
    const timeScale = deltaTime / targetFrameDuration + 0.00001;
    let angleFactor = timeScale;
    const snapRotation = quat.create();

    if (this.isPointerDown) {
      const INTENSITY = 0.3 * timeScale;
      const ANGLE_AMPLIFICATION = 5 / timeScale;
      const midPointerPos = vec2.sub(vec2.create(), this.pointerPos, this.previousPointerPos);
      vec2.scale(midPointerPos, midPointerPos, INTENSITY);

      if (vec2.sqrLen(midPointerPos) > this.EPSILON) {
        vec2.add(midPointerPos, this.previousPointerPos, midPointerPos);

        const p = this.project(midPointerPos);
        const q = this.project(this.previousPointerPos);
        const a = vec3.normalize(vec3.create(), p);
        const b = vec3.normalize(vec3.create(), q);

        vec2.copy(this.previousPointerPos, midPointerPos);

        angleFactor *= ANGLE_AMPLIFICATION;

        this.quatFromVectors(a, b, this.pointerRotation, angleFactor);
      } else {
        quat.slerp(this.pointerRotation, this.pointerRotation, this.IDENTITY_QUAT, INTENSITY);
      }
    } else {
      const INTENSITY = 0.1 * timeScale;
      quat.slerp(this.pointerRotation, this.pointerRotation, this.IDENTITY_QUAT, INTENSITY);

      if (this.snapTargetDirection) {
        const SNAPPING_INTENSITY = 0.2;
        const a = this.snapTargetDirection;
        const b = this.snapDirection;
        const sqrDist = vec3.squaredDistance(a, b);
        const distanceFactor = Math.max(0.1, 1 - sqrDist * 10);
        angleFactor *= SNAPPING_INTENSITY * distanceFactor;
        this.quatFromVectors(a, b, snapRotation, angleFactor);
      }
    }

    const combinedQuat = quat.multiply(quat.create(), snapRotation, this.pointerRotation);
    
    // 确保四元数在同一半球,避免长路径插值导致镜像
    if (quat.dot(combinedQuat, this.orientation) < 0) {
      quat.scale(combinedQuat, combinedQuat, -1);
    }
    
    this.orientation = quat.multiply(quat.create(), combinedQuat, this.orientation);
    quat.normalize(this.orientation, this.orientation);

    const RA_INTENSITY = 0.8 * timeScale;
    
    // 确保插值四元数在同一半球
    if (quat.dot(combinedQuat, this._combinedQuat) < 0) {
      quat.scale(combinedQuat, combinedQuat, -1);
    }
    
    quat.slerp(this._combinedQuat, this._combinedQuat, combinedQuat, RA_INTENSITY);
    quat.normalize(this._combinedQuat, this._combinedQuat);

    // 使用 clamp 限制四元数 w 分量,避免 acos 产生 NaN
    const w = Math.max(-1, Math.min(1, this._combinedQuat[3]));
    const rad = Math.acos(w) * 2.0;
    const s = Math.sin(rad / 2.0);
    let rv = 0;
    if (Math.abs(s) > 0.000001) {
      rv = rad / (2 * Math.PI);
      this.rotationAxis[0] = this._combinedQuat[0] / s;
      this.rotationAxis[1] = this._combinedQuat[1] / s;
      this.rotationAxis[2] = this._combinedQuat[2] / s;
      // 归一化旋转轴,确保方向稳定
      const axisLen = Math.sqrt(
        this.rotationAxis[0] * this.rotationAxis[0] +
        this.rotationAxis[1] * this.rotationAxis[1] +
        this.rotationAxis[2] * this.rotationAxis[2]
      );
      if (axisLen > 0.000001) {
        this.rotationAxis[0] /= axisLen;
        this.rotationAxis[1] /= axisLen;
        this.rotationAxis[2] /= axisLen;
      }
    }

    const RV_INTENSITY = 0.5 * timeScale;
    this._rotationVelocity += (rv - this._rotationVelocity) * RV_INTENSITY;
    this.rotationVelocity = this._rotationVelocity / timeScale;

    this.updateCallback(deltaTime);
  }

  private quatFromVectors(a: vec3, b: vec3, out: quat, angleFactor = 1): { q: quat; axis: vec3; angle: number } {
    const axis = vec3.cross(vec3.create(), a, b);
    const axisLen = vec3.length(axis);
    
    // 如果向量几乎平行,返回单位四元数避免跳跃
    if (axisLen < 0.000001) {
      quat.identity(out);
      return { q: out, axis: vec3.fromValues(0, 1, 0), angle: 0 };
    }
    
    vec3.normalize(axis, axis);
    const d = Math.max(-1, Math.min(1, vec3.dot(a, b)));
    let angle = Math.acos(d) * angleFactor;
    
    // 限制角度避免过大的旋转导致镜像
    const MAX_ANGLE = Math.PI;
    angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle));
    
    quat.setAxisAngle(out, axis, angle);
    return { q: out, axis, angle };
  }

  private project(pos: vec2): vec3 {
    const r = 2;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const s = Math.max(w, h) - 1;

    const x = (2 * pos[0] - w - 1) / s;
    const y = (2 * pos[1] - h - 1) / s;
    let z = 0;
    const xySq = x * x + y * y;
    const rSq = r * r;

    // 使用平滑的双曲面投影,避免在中心位置突变
    if (xySq <= rSq / 2.0) {
      z = Math.sqrt(Math.max(0, rSq - xySq));
    } else {
      z = rSq / (2.0 * Math.sqrt(xySq));
    }
    
    // 归一化投影向量,确保在单位球面上
    const result = vec3.fromValues(-x, y, z);
    vec3.normalize(result, result);
    vec3.scale(result, result, r);
    
    return result;
  }
}

interface MenuItem {
  id: string | number;
  image: string;
  title: string;
  description: string;
  subtitle?: string;
  ctaLabel?: string;
  disabled?: boolean;
  link?: string;
  payload?: unknown;
  reservationRequired?: boolean;
  visualState?: 'normal' | 'out_of_stock' | 'down' | 'login_required' | 'limit_reached';
  statusText?: string;
  supportsQuantity?: boolean;
  quantity?: number;
  limitReached?: boolean;
  stock?: number | null;
}

type ActiveItemCallback = (index: number) => void;
type MovementChangeCallback = (isMoving: boolean) => void;
type InitCallback = (instance: InfiniteGridMenu) => void;

interface Camera {
  matrix: mat4;
  near: number;
  far: number;
  fov: number;
  aspect: number;
  position: vec3;
  up: vec3;
  matrices: {
    view: mat4;
    projection: mat4;
    inversProjection: mat4;
  };
}

class InfiniteGridMenu {
  private gl: WebGL2RenderingContext | null = null;
  private discProgram: WebGLProgram | null = null;
  private discVAO: WebGLVertexArrayObject | null = null;
  private discBuffers!: {
    vertices: Float32Array;
    indices: Uint16Array;
    normals: Float32Array;
    uvs: Float32Array;
  };
  private icoGeo!: IcosahedronGeometry;
  private discGeo!: DiscGeometry;
  private worldMatrix = mat4.create();
  private tex: WebGLTexture | null = null;
  private control!: ArcballControl;

  private discLocations!: {
    aModelPosition: number;
    aModelUvs: number;
    aInstanceMatrix: number;
    uWorldMatrix: WebGLUniformLocation | null;
    uViewMatrix: WebGLUniformLocation | null;
    uProjectionMatrix: WebGLUniformLocation | null;
    uCameraPosition: WebGLUniformLocation | null;
    uScaleFactor: WebGLUniformLocation | null;
    uRotationAxisVelocity: WebGLUniformLocation | null;
    uTex: WebGLUniformLocation | null;
    uFrames: WebGLUniformLocation | null;
    uItemCount: WebGLUniformLocation | null;
    uAtlasSize: WebGLUniformLocation | null;
  };

  private viewportSize = vec2.create();
  private drawBufferSize = vec2.create();

  private discInstances!: {
    matricesArray: Float32Array;
    matrices: Float32Array[];
    buffer: WebGLBuffer | null;
  };

  private instancePositions: vec3[] = [];
  private DISC_INSTANCE_COUNT = 0;
  private atlasSize = 1;
  private textureVersion = 0;
  private rafId: number | null = null;

  private _time = 0;
  private _deltaTime = 0;
  private _deltaFrames = 0;
  private _frames = 0;

  private movementActive = false;

  private TARGET_FRAME_DURATION = 1000 / 60;
  private SPHERE_RADIUS = 2;

  public camera: Camera = {
    matrix: mat4.create(),
    near: 0.1,
    far: 40,
    fov: Math.PI / 4,
    aspect: 1,
    position: vec3.fromValues(0, 0, 3),
    up: vec3.fromValues(0, 1, 0),
    matrices: {
      view: mat4.create(),
      projection: mat4.create(),
      inversProjection: mat4.create()
    }
  };

  public smoothRotationVelocity = 0;
  public scaleFactor = 1.0;

  constructor(
    private canvas: HTMLCanvasElement,
    private items: MenuItem[],
    private onActiveItemChange: ActiveItemCallback,
    private onMovementChange: MovementChangeCallback,
    onInit?: InitCallback
  ) {
    this.init(onInit);
  }

  public resize(): void {
    const needsResize = resizeCanvasToDisplaySize(this.canvas);
    if (!this.gl) return;
    if (needsResize) {
      this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    }
    this.updateProjectionMatrix();
  }

  public updateItems(nextItems: MenuItem[]): void {
    this.items = Array.isArray(nextItems) ? nextItems : [];
    this.initTexture();
  }

  public run(time = 0): void {
    this._deltaTime = Math.min(32, time - this._time);
    this._time = time;
    this._deltaFrames = this._deltaTime / this.TARGET_FRAME_DURATION;
    this._frames += this._deltaFrames;

    this.animate(this._deltaTime);
    this.render();

    this.rafId = requestAnimationFrame(t => this.run(t));
  }

  private init(onInit?: InitCallback): void {
    const gl = this.canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true
    });
    if (!gl) {
      throw new Error('No WebGL 2 context!');
    }
    this.gl = gl;

    vec2.set(this.viewportSize, this.canvas.clientWidth, this.canvas.clientHeight);
    vec2.clone(this.drawBufferSize);

    this.discProgram = createProgram(gl, [discVertShaderSource, discFragShaderSource], null, {
      aModelPosition: 0,
      aModelNormal: 1,
      aModelUvs: 2,
      aInstanceMatrix: 3
    });

    this.discLocations = {
      aModelPosition: gl.getAttribLocation(this.discProgram!, 'aModelPosition'),
      aModelUvs: gl.getAttribLocation(this.discProgram!, 'aModelUvs'),
      aInstanceMatrix: gl.getAttribLocation(this.discProgram!, 'aInstanceMatrix'),
      uWorldMatrix: gl.getUniformLocation(this.discProgram!, 'uWorldMatrix'),
      uViewMatrix: gl.getUniformLocation(this.discProgram!, 'uViewMatrix'),
      uProjectionMatrix: gl.getUniformLocation(this.discProgram!, 'uProjectionMatrix'),
      uCameraPosition: gl.getUniformLocation(this.discProgram!, 'uCameraPosition'),
      uScaleFactor: gl.getUniformLocation(this.discProgram!, 'uScaleFactor'),
      uRotationAxisVelocity: gl.getUniformLocation(this.discProgram!, 'uRotationAxisVelocity'),
      uTex: gl.getUniformLocation(this.discProgram!, 'uTex'),
      uFrames: gl.getUniformLocation(this.discProgram!, 'uFrames'),
      uItemCount: gl.getUniformLocation(this.discProgram!, 'uItemCount'),
      uAtlasSize: gl.getUniformLocation(this.discProgram!, 'uAtlasSize')
    };

    this.discGeo = new DiscGeometry(56, 1);
    this.discBuffers = this.discGeo.data;
    this.discVAO = makeVertexArray(
      gl,
      [
        [makeBuffer(gl, this.discBuffers.vertices, gl.STATIC_DRAW), this.discLocations.aModelPosition, 3],
        [makeBuffer(gl, this.discBuffers.uvs, gl.STATIC_DRAW), this.discLocations.aModelUvs, 2]
      ],
      this.discBuffers.indices
    );

    this.icoGeo = new IcosahedronGeometry();
    this.icoGeo.subdivide(1).spherize(this.SPHERE_RADIUS);
    this.instancePositions = this.icoGeo.vertices.map(v => v.position);
    this.DISC_INSTANCE_COUNT = this.icoGeo.vertices.length;
    this.initDiscInstances(this.DISC_INSTANCE_COUNT);
    this.initTexture();
    this.control = new ArcballControl(this.canvas, deltaTime => this.onControlUpdate(deltaTime));

    this.updateCameraMatrix();
    this.updateProjectionMatrix();

    this.resize();

    if (onInit) {
      onInit(this);
    }
  }

  private initTexture(): void {
    if (!this.gl) return;
    const gl = this.gl;

    if (!this.tex) {
      this.tex = createAndSetupTexture(gl, gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
    }

    const requestId = ++this.textureVersion;
    const sourceItems = this.items.length ? [...this.items] : [...defaultItems];
    const itemCount = Math.max(1, sourceItems.length);
    this.atlasSize = Math.ceil(Math.sqrt(itemCount));
    const cellSize = 512;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    canvas.width = this.atlasSize * cellSize;
    canvas.height = this.atlasSize * cellSize;

    const placeholderFill = () => {
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    placeholderFill();

    Promise.all(
      sourceItems.map(
        item =>
          new Promise<HTMLImageElement>(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const finalize = () => resolve(img);
            img.onload = finalize;
            img.onerror = finalize;
            img.src = item.image;
          })
      )
    ).then(images => {
      if (this.textureVersion !== requestId) {
        return;
      }

      placeholderFill();

      images.forEach((img, i) => {
        const x = (i % this.atlasSize) * cellSize;
        const y = Math.floor(i / this.atlasSize) * cellSize;
        const item = sourceItems[i];
        const shouldDesaturate =
          item?.visualState === 'down' || item?.visualState === 'out_of_stock';

        ctx.save();
        ctx.filter = shouldDesaturate ? 'grayscale(100%) saturate(0%) brightness(0.75)' : 'none';
        ctx.drawImage(img, x, y, cellSize, cellSize);
        ctx.restore();

        if (shouldDesaturate) {
          ctx.save();
          ctx.fillStyle = 'rgba(17, 24, 39, 0.55)';
          ctx.fillRect(x, y, cellSize, cellSize);

          const label = item?.statusText || item?.ctaLabel || '';
          if (label) {
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 68px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
            ctx.fillText(label, x + cellSize / 2, y + cellSize / 2);
          }
          ctx.restore();
        }
      });

      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.generateMipmap(gl.TEXTURE_2D);
    });
  }

  private initDiscInstances(count: number): void {
    if (!this.gl || !this.discVAO) return;
    const gl = this.gl;

    const matricesArray = new Float32Array(count * 16);
    const matrices: Float32Array[] = [];
    for (let i = 0; i < count; ++i) {
      const instanceMatrixArray = new Float32Array(matricesArray.buffer, i * 16 * 4, 16);
      mat4.identity(instanceMatrixArray as unknown as mat4);
      matrices.push(instanceMatrixArray);
    }

    this.discInstances = {
      matricesArray,
      matrices,
      buffer: gl.createBuffer()
    };

    gl.bindVertexArray(this.discVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.discInstances.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.discInstances.matricesArray.byteLength, gl.DYNAMIC_DRAW);

    const mat4AttribSlotCount = 4;
    const bytesPerMatrix = 16 * 4;
    for (let j = 0; j < mat4AttribSlotCount; ++j) {
      const loc = this.discLocations.aInstanceMatrix + j;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, bytesPerMatrix, j * 4 * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }

  private animate(deltaTime: number): void {
    if (!this.gl) return;
    this.control.update(deltaTime, this.TARGET_FRAME_DURATION);

    const positions = this.instancePositions.map(p => vec3.transformQuat(vec3.create(), p, this.control.orientation));
    const scale = 0.25;
    const SCALE_INTENSITY = 0.6;

    positions.forEach((p, ndx) => {
      const s = (Math.abs(p[2]) / this.SPHERE_RADIUS) * SCALE_INTENSITY + (1 - SCALE_INTENSITY);
      const finalScale = s * scale;
      const matrix = mat4.create();

      mat4.multiply(matrix, matrix, mat4.fromTranslation(mat4.create(), vec3.negate(vec3.create(), p)));
      mat4.multiply(matrix, matrix, mat4.targetTo(mat4.create(), [0, 0, 0], p, [0, 1, 0]));
      mat4.multiply(matrix, matrix, mat4.fromScaling(mat4.create(), [finalScale, finalScale, finalScale]));
      mat4.multiply(matrix, matrix, mat4.fromTranslation(mat4.create(), [0, 0, -this.SPHERE_RADIUS]));

      mat4.copy(this.discInstances.matrices[ndx], matrix);
    });

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.discInstances.buffer);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.discInstances.matricesArray);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);

    this.smoothRotationVelocity = this.control.rotationVelocity;
  }

  private render(): void {
    if (!this.gl || !this.discProgram) return;
    const gl = this.gl;

    gl.useProgram(this.discProgram);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.uniformMatrix4fv(this.discLocations.uWorldMatrix, false, this.worldMatrix);
    gl.uniformMatrix4fv(this.discLocations.uViewMatrix, false, this.camera.matrices.view);
    gl.uniformMatrix4fv(this.discLocations.uProjectionMatrix, false, this.camera.matrices.projection);
    gl.uniform3f(
      this.discLocations.uCameraPosition,
      this.camera.position[0],
      this.camera.position[1],
      this.camera.position[2]
    );
    gl.uniform4f(
      this.discLocations.uRotationAxisVelocity,
      this.control.rotationAxis[0],
      this.control.rotationAxis[1],
      this.control.rotationAxis[2],
      this.smoothRotationVelocity * 1.1
    );

    gl.uniform1i(this.discLocations.uItemCount, this.items.length);
    gl.uniform1i(this.discLocations.uAtlasSize, this.atlasSize);

    gl.uniform1f(this.discLocations.uFrames, this._frames);
    gl.uniform1f(this.discLocations.uScaleFactor, this.scaleFactor);

    gl.uniform1i(this.discLocations.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);

    gl.bindVertexArray(this.discVAO);
    gl.drawElementsInstanced(
      gl.TRIANGLES,
      this.discBuffers.indices.length,
      gl.UNSIGNED_SHORT,
      0,
      this.DISC_INSTANCE_COUNT
    );
    gl.bindVertexArray(null);
  }

  private updateCameraMatrix(): void {
    mat4.targetTo(this.camera.matrix, this.camera.position, [0, 0, 0], this.camera.up);
    mat4.invert(this.camera.matrices.view, this.camera.matrix);
  }

  private updateProjectionMatrix(): void {
    if (!this.gl) return;
    const canvasEl = this.gl.canvas as HTMLCanvasElement;
    this.camera.aspect = canvasEl.clientWidth / canvasEl.clientHeight;
    const height = this.SPHERE_RADIUS * 0.35;
    const distance = this.camera.position[2];
    if (this.camera.aspect > 1) {
      this.camera.fov = 2 * Math.atan(height / distance);
    } else {
      this.camera.fov = 2 * Math.atan(height / this.camera.aspect / distance);
    }
    mat4.perspective(
      this.camera.matrices.projection,
      this.camera.fov,
      this.camera.aspect,
      this.camera.near,
      this.camera.far
    );
    mat4.invert(this.camera.matrices.inversProjection, this.camera.matrices.projection);
  }

  private onControlUpdate(deltaTime: number): void {
    const timeScale = deltaTime / this.TARGET_FRAME_DURATION + 0.0001;
    let damping = 5 / timeScale;
    let cameraTargetZ = 3;

    const isMoving = this.control.isPointerDown || Math.abs(this.smoothRotationVelocity) > 0.01;

    if (isMoving !== this.movementActive) {
      this.movementActive = isMoving;
      this.onMovementChange(isMoving);
    }

    if (!this.control.isPointerDown) {
      const nearestVertexIndex = this.findNearestVertexIndex();
      const itemIndex = nearestVertexIndex % Math.max(1, this.items.length);
      this.onActiveItemChange(itemIndex);
      const snapDirection = vec3.normalize(vec3.create(), this.getVertexWorldPosition(nearestVertexIndex));
      this.control.snapTargetDirection = snapDirection;
    } else {
      cameraTargetZ += this.control.rotationVelocity * 80 + 2.5;
      damping = 7 / timeScale;
    }

    this.camera.position[2] += (cameraTargetZ - this.camera.position[2]) / damping;
    this.updateCameraMatrix();
  }

  private findNearestVertexIndex(): number {
    const n = this.control.snapDirection;
    const inversOrientation = quat.conjugate(quat.create(), this.control.orientation);
    const nt = vec3.transformQuat(vec3.create(), n, inversOrientation);

    let maxD = -1;
    let nearestVertexIndex = 0;
    for (let i = 0; i < this.instancePositions.length; ++i) {
      const d = vec3.dot(nt, this.instancePositions[i]);
      if (d > maxD) {
        maxD = d;
        nearestVertexIndex = i;
      }
    }
    return nearestVertexIndex;
  }

  private getVertexWorldPosition(index: number): vec3 {
    const nearestVertexPos = this.instancePositions[index];
    return vec3.transformQuat(vec3.create(), nearestVertexPos, this.control.orientation);
  }

  public dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.control) {
      this.control.dispose();
    }

    const gl = this.gl;
    if (gl) {
      if (this.discInstances?.buffer) {
        gl.deleteBuffer(this.discInstances.buffer);
      }
      if (this.discVAO) {
        gl.deleteVertexArray(this.discVAO);
      }
      if (this.discProgram) {
        gl.deleteProgram(this.discProgram);
      }
      if (this.tex) {
        gl.deleteTexture(this.tex);
      }
    }
    this.gl = null;
  }
}

const defaultItems: MenuItem[] = [
  {
    id: 'placeholder',
    image: 'https://picsum.photos/900/900?grayscale',
    title: '加载中',
    description: '请稍候',
    ctaLabel: '+',
    reservationRequired: false,
    visualState: 'normal'
  }
];

interface InfiniteMenuProps {
  items?: MenuItem[];
  onAddToCart?: (item: MenuItem, sourceElement: HTMLElement) => void;
  onDecrement?: (item: MenuItem, sourceElement: HTMLElement) => void;
  onActiveItemChange?: (item: MenuItem | null) => void;
}

const InfiniteMenu: FC<InfiniteMenuProps> = ({ items = [], onAddToCart, onDecrement, onActiveItemChange }) => {
  const initialItems = items.length ? items : defaultItems;
  const canvasRef = useRef<HTMLCanvasElement | null>(null) as MutableRefObject<HTMLCanvasElement | null>;
  const sketchRef = useRef<InfiniteGridMenu | null>(null);
  const itemsRef = useRef<MenuItem[]>(initialItems);
  itemsRef.current = initialItems;
  const onActiveItemChangeRef = useRef(onActiveItemChange);
  const [activeItem, setActiveItem] = useState<MenuItem | null>(initialItems[0] ?? null);
  const activeItemRef = useRef<MenuItem | null>(initialItems[0] ?? null);
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [showButton, setShowButton] = useState<boolean>(false);

  useEffect(() => {
    onActiveItemChangeRef.current = onActiveItemChange;
  }, [onActiveItemChange]);

  useEffect(() => {
    activeItemRef.current = activeItem;
  }, [activeItem]);

  const handleSketchActiveItem = useCallback(
    (index: number) => {
      const sourceItems = itemsRef.current;
      if (!sourceItems.length) {
        setActiveItem(null);
        activeItemRef.current = null;
        onActiveItemChangeRef.current?.(null);
        return;
      }
      const safeIndex = index % sourceItems.length;
      const selectedItem = sourceItems[safeIndex];
      setActiveItem(selectedItem);
      activeItemRef.current = selectedItem;
      onActiveItemChangeRef.current?.(selectedItem);
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sketch = new InfiniteGridMenu(canvas, itemsRef.current, handleSketchActiveItem, setIsMoving, instance =>
      instance.run()
    );
    sketchRef.current = sketch;

    const handleResize = () => {
      sketch.resize();
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      sketch.dispose();
      sketchRef.current = null;
    };
  }, [handleSketchActiveItem]);

  useEffect(() => {
    const sourceItems = items.length ? items : defaultItems;
    itemsRef.current = sourceItems;

    const previousActive = activeItemRef.current;
    let nextActive: MenuItem | null = null;
    if (sourceItems.length) {
      if (previousActive) {
        nextActive = sourceItems.find(item => item.id === previousActive.id) ?? sourceItems[0];
      } else {
        nextActive = sourceItems[0];
      }
    }

    setActiveItem(nextActive);
    activeItemRef.current = nextActive;
    onActiveItemChangeRef.current?.(nextActive ?? null);
    sketchRef.current?.updateItems(sourceItems);
  }, [items]);

  useEffect(() => {
    setShowButton(!isMoving);
  }, [isMoving]);

  const shouldShowButton = Boolean(activeItem) && showButton;
  const isButtonInteractive = shouldShowButton && !(activeItem?.disabled ?? false);
  const supportsQuantityControl = Boolean(activeItem?.supportsQuantity);
  const rawQuantity = typeof activeItem?.quantity === 'number' ? activeItem?.quantity : 0;
  const quantity = supportsQuantityControl ? Math.max(0, rawQuantity) : 0;
  const isQuantityMode = supportsQuantityControl && quantity > 0;
  const limitReached = supportsQuantityControl ? Boolean(activeItem?.limitReached) : false;
  const actionButtonLabel = activeItem?.ctaLabel ?? '+';
  const isSpecSelectAction =
    !isQuantityMode &&
    !activeItem?.disabled &&
    actionButtonLabel === '选规格';
  const isMutedState = activeItem?.visualState === 'down' || activeItem?.visualState === 'out_of_stock';
  const actionButtonAriaLabel = isQuantityMode
    ? `${activeItem?.title || '当前商品'} 数量调整`
    : activeItem
    ? activeItem.disabled
      ? `${activeItem.title || '当前商品'}：${actionButtonLabel}`
      : isSpecSelectAction
      ? `选择规格：${activeItem.title || '当前商品'}`
      : `加入购物车：${activeItem.title || '当前商品'}`
    : '加入购物车';
  const labelLength = actionButtonLabel.length;
  const actionButtonTextClass =
    labelLength <= 1
      ? 'text-[28px] font-bold leading-none'
      : labelLength === 2
      ? 'text-base font-semibold tracking-wide'
      : 'text-sm font-semibold leading-none px-2 text-center tracking-wide';
  const reservationFlag =
    activeItem?.reservationRequired ??
    (typeof activeItem?.payload === 'object' && activeItem?.payload !== null
      ? Boolean((activeItem?.payload as { reservation_required?: unknown }).reservation_required)
      : false);
  const buttonColorClass = activeItem?.disabled
    ? isMutedState
      ? 'cursor-not-allowed pointer-events-none bg-gradient-to-br from-gray-400 to-gray-500 text-white shadow-inner'
      : 'cursor-not-allowed pointer-events-none bg-gray-200/95 text-gray-600 shadow-inner'
    : reservationFlag
    ? 'cursor-pointer bg-gradient-to-br from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white shadow-xl'
    : 'cursor-pointer bg-gradient-to-br from-orange-500 to-pink-600 hover:from-pink-600 hover:to-purple-500 text-white shadow-xl';

  const actionButtonClassList = [
    'action-button',
    shouldShowButton ? 'active' : 'inactive',
    'absolute left-1/2 bottom-[clamp(2.5rem,12vw,5.5rem)]',
    'select-none z-20',
    'transition-transform duration-300 ease-out'
  ];

  if (isQuantityMode) {
    actionButtonClassList.push(
      'px-3 sm:px-4 py-3',
      'rounded-full border-[4px] border-white',
      'bg-white/95 shadow-2xl backdrop-blur-md',
      'flex items-center gap-3 sm:gap-4',
      'min-w-[168px] sm:min-w-[184px]',
      'h-[68px]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500'
    );
  } else {
    actionButtonClassList.push(
      'rounded-full border-[4px] border-white',
      'w-[60px] h-[60px] sm:w-[68px] sm:h-[68px]',
      'grid place-items-center',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500',
      buttonColorClass
    );
  }

  const actionButtonClassName = actionButtonClassList.join(' ');
  const buttonDataState = shouldShowButton
    ? isQuantityMode
      ? 'quantity'
      : isButtonInteractive
      ? 'active'
      : 'disabled'
    : 'inactive';

  const handleQuantityIncrease = (event: MouseEvent<HTMLButtonElement>) => {
    if (!activeItem || !supportsQuantityControl || !onAddToCart || limitReached || !isButtonInteractive) return;
    event.stopPropagation();
    onAddToCart(activeItem, event.currentTarget);
  };

  const handleQuantityDecrease = (event: MouseEvent<HTMLButtonElement>) => {
    if (!activeItem || !supportsQuantityControl || !onDecrement || quantity <= 0 || !isButtonInteractive) return;
    event.stopPropagation();
    onDecrement(activeItem, event.currentTarget);
  };

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isButtonInteractive || !activeItem) return;
    if (isQuantityMode) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (onAddToCart) {
        onAddToCart(activeItem, event.currentTarget);
        return;
      }
      if (activeItem.link) {
        if (activeItem.link.startsWith('http')) {
          window.open(activeItem.link, '_blank');
        } else {
          console.log('Internal route:', activeItem.link);
        }
      }
    }
  };

  const handleButtonClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!isButtonInteractive || !activeItem) return;
    if (isQuantityMode) return;
    if (onAddToCart) {
      onAddToCart(activeItem, event.currentTarget);
      return;
    }
    if (activeItem.link) {
      if (activeItem.link.startsWith('http')) {
        window.open(activeItem.link, '_blank');
      } else {
        console.log('Internal route:', activeItem.link);
      }
    }
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        id="infinite-grid-menu-canvas"
        ref={canvasRef}
        className="cursor-grab w-full h-full overflow-hidden relative outline-none active:cursor-grabbing"
        style={{
          maskImage: 'radial-gradient(ellipse 85% 85% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 85% at 50% 50%, black 40%, transparent 100%)'
        }}
      />

      {activeItem && (
        <div
          role={isQuantityMode ? 'group' : 'button'}
          tabIndex={!isQuantityMode && isButtonInteractive ? 0 : -1}
          aria-label={actionButtonAriaLabel}
          aria-disabled={!isQuantityMode ? (activeItem.disabled || undefined) : undefined}
          aria-hidden={!shouldShowButton || undefined}
          onClick={isQuantityMode ? undefined : handleButtonClick}
          onKeyDown={isQuantityMode ? undefined : handleButtonKeyDown}
          className={actionButtonClassName}
          data-state={buttonDataState}
        >
          {isQuantityMode ? (
            <div className="flex items-center gap-3 sm:gap-4 w-full">
              <button
                type="button"
                onClick={handleQuantityDecrease}
                disabled={quantity <= 0 || !onDecrement || !isButtonInteractive}
                aria-label={`减少 ${activeItem.title || '当前商品'} 数量`}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-2xl font-bold leading-none">−</span>
              </button>
              <div className="flex-1 text-center">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500 leading-none mb-1">数量</div>
                <div className="text-2xl font-bold text-slate-900 leading-none">{quantity}</div>
                {limitReached && (
                  <div className="text-[10px] text-amber-500 mt-1 font-medium">已达库存上限</div>
                )}
              </div>
              <button
                type="button"
                onClick={handleQuantityIncrease}
                disabled={limitReached || !onAddToCart || !isButtonInteractive}
                aria-label={
                  limitReached
                    ? `已达库存上限：${activeItem.title || '当前商品'}`
                    : `增加 ${activeItem.title || '当前商品'} 数量`
                }
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-orange-500 to-pink-600 text-white flex items-center justify-center shadow-lg transition hover:from-orange-500 hover:to-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-2xl font-bold leading-none">+</span>
              </button>
            </div>
          ) : (
            isSpecSelectAction ? (
              <i className="fas fa-list-ul text-base" aria-hidden="true"></i>
            ) : (
              <span className={actionButtonTextClass}>{actionButtonLabel}</span>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default InfiniteMenu;
