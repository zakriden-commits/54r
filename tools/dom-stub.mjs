/* Общие DOM/WebGL-стабы для Node-проверок клиента. */
/* ---------- минимальный DOM ---------- */
class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(...c) { c.forEach(x => this.set.add(x)); }
  remove(...c) { c.forEach(x => this.set.delete(x)); }
  toggle(c, f) { if (f === undefined) f = !this.set.has(c); f ? this.set.add(c) : this.set.delete(c); return f; }
  contains(c) { return this.set.has(c); }
}
class FakeCtx {
  constructor() { this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.font = ''; this.textAlign = ''; this.textBaseline = ''; this.globalAlpha = 1; }
  fillRect() {} strokeRect() {} clearRect() {} beginPath() {} moveTo() {} lineTo() {} arc() {} fill() {} stroke() {}
  bezierCurveTo() {} quadraticCurveTo() {} closePath() {} fillText() {} strokeText() {} save() {} restore() {}
  translate() {} rotate() {} scale() {} drawImage() {} setTransform() {}
  measureText() { return { width: 10 }; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  putImageData() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
}
const elements = new Map();
let idc = 0;
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.style = {}; this.dataset = {};
    this.classList = new ClassList(this);
    this._html = ''; this.attrs = {};
    this.width = 300; this.height = 150;
    this._id = 'e' + (idc++);
  }
  set className(v) { this._cls = v; String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c)); }
  get className() { return Array.from(this.classList.set).join(' '); }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text || ''; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener() {} removeEventListener() {}
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width || 100, height: this.height || 100, right: 100, bottom: 100 }; }
  getContext(type) {
    if (type === '2d') { this._ctx2d = this._ctx2d || new FakeCtx(); return this._ctx2d; }
    if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return makeGL(this);
    return null;
  }
  querySelector() { return new El('div'); }
  querySelectorAll() { return []; }
  closest() { return null; }
  requestPointerLock() {}
  focus() {}
  toDataURL() { return 'data:,'; }
}
function makeGL(canvas) {
  const gl = {
    canvas,
    drawingBufferWidth: canvas.width, drawingBufferHeight: canvas.height,
    getParameter: (p) => {
      if (p === 7938) return 'WebGL 2.0 (stub)';
      if (p === 7936) return 'stub'; if (p === 7937) return 'stub renderer';
      if (p === 34076) return 4096;
      if (p === 34921) return 16; if (p === 34930) return 32;
      if (p === 36347 || p === 36348) return 1024;
      if (p === 35660 || p === 35661) return 32;
      if (p === 36063) return 4;
      return 0;
    },
    getExtension: (n) => {
      if (n === 'WEBGL_debug_renderer_info') return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
      if (n && n.startsWith('EXT_texture_filter_anisotropic')) return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047, TEXTURE_MAX_ANISOTROPY_EXT: 34046 };
      if (n === 'WEBGL_lose_context') return { loseContext() {}, restoreContext() {} };
      return null;
    },
    getSupportedExtensions: () => [],
    createContext: () => null,
    createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true,
    getShaderInfoLog: () => '', createProgram: () => ({ id: 1 }), attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, getProgramInfoLog: () => '', useProgram() {}, deleteProgram() {}, deleteShader() {},
    getAttribLocation: () => 0, getUniformLocation: () => ({}), getActiveAttrib: () => ({ name: 'a', type: 0, size: 1 }),
    getActiveUniform: () => ({ name: 'u', type: 0, size: 1 }),
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {}, enableVertexAttribArray() {},
    vertexAttribPointer() {}, disableVertexAttribArray() {},
    createTexture: () => ({}), bindTexture() {}, texImage2D() {}, texSubImage2D() {}, texParameteri() {},
    generateMipmap() {}, deleteTexture() {}, activeTexture() {}, pixelStorei() {}, compressedTexImage2D() {},
    createFramebuffer: () => ({}), bindFramebuffer() {}, framebufferTexture2D() {}, checkFramebufferStatus: () => 36053,
    deleteFramebuffer() {}, framebufferRenderbuffer() {}, createRenderbuffer: () => ({}), bindRenderbuffer() {},
    renderbufferStorage() {}, renderbufferStorageMultisample() {}, deleteRenderbuffer() {},
    createVertexArray: () => ({}), bindVertexArray() {}, deleteVertexArray() {},
    enable() {}, disable() {}, clear() {}, clearColor() {}, clearDepth() {}, clearStencil() {},
    depthFunc() {}, depthMask() {}, depthRange() {}, blendFunc() {}, blendFuncSeparate() {}, blendEquation() {},
    blendEquationSeparate() {}, blendColor() {}, colorMask() {}, cullFace() {}, frontFace() {}, lineWidth() {},
    polygonOffset() {}, scissor() {}, viewport() {}, stencilFunc() {}, stencilOp() {}, stencilMask() {},
    drawArrays() {}, drawElements() {}, drawArraysInstanced() {}, drawElementsInstanced() {}, drawBuffers() {},
    vertexAttribDivisor() {}, uniform1i() {}, uniform1f() {}, uniform2f() {}, uniform3f() {}, uniform4f() {},
    uniform1iv() {}, uniform1fv() {}, uniform2fv() {}, uniform3fv() {}, uniform4fv() {}, uniformMatrix3fv() {},
    uniformMatrix4fv() {}, uniform2iv() {}, uniform3iv() {}, uniform4iv() {},
    readPixels() {}, flush() {}, finish() {}, getError: () => 0, isContextLost: () => false,
    texStorage2D() {}, texImage3D() {}, drawRangeElements() {}, vertexAttribIPointer() {},
    beginQuery() {}, endQuery() {}, createQuery: () => ({}), getQueryParameter: () => true, deleteQuery() {},
    fenceSync: () => ({}), clientWaitSync: () => 0x911a, deleteSync() {}, waitSync() {},
    blitFramebuffer() {}, invalidateFramebuffer() {}, readBuffer() {}, texParameterf() {},
    createSampler: () => ({}), bindSampler() {}, samplerParameteri() {}, samplerParameterf() {}, deleteSampler() {},
    uniformBlockBinding() {}, getUniformBlockIndex: () => 0, getActiveUniformBlockParameter: () => 0,
    uniform1ui() {}, uniform2uiv() {}, texStorage3D() {}, copyTexImage2D() {}, copyTexSubImage2D() {},
    getFragDataLocation: () => 0, bindAttribLocation() {}, bindTransformFeedback() {},
    createTransformFeedback: () => ({}), deleteTransformFeedback() {}, beginTransformFeedback() {},
    endTransformFeedback() {}, transformFeedbackVaryings() {}, pauseTransformFeedback() {},
    resumeTransformFeedback() {}, getTransformFeedbackVarying: () => ({}), createQuery2: () => ({}),
    getInternalformatParameter: () => null, renderbufferStorageMultisampleEXT() {},
    MAX_TEXTURE_SIZE: 4096, TEXTURE_2D: 3553, ARRAY_BUFFER: 34962, STATIC_DRAW: 35044,
    FLOAT: 5126, UNSIGNED_BYTE: 5121, RGBA: 6408, RGB: 6407, TRIANGLES: 4, VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714, FRAMEBUFFER: 36160,
    RENDERBUFFER: 36161, COLOR_ATTACHMENT0: 36064, DEPTH_ATTACHMENT: 36096, FRAMEBUFFER_COMPLETE: 36053,
    UNPACK_FLIP_Y_WEBGL: 37440, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441, TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243, TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240, DEPTH_TEST: 2929,
    BLEND: 3042, CULL_FACE: 2884, SCISSOR_TEST: 3089, STENCIL_TEST: 2960, DITHER: 3024,
    NO_ERROR: 0, CONTEXT_LOST_WEBGL: 37442, TEXTURE0: 33984, ELEMENT_ARRAY_BUFFER: 34963,
    DYNAMIC_DRAW: 35048, STREAM_DRAW: 35040, LINEAR: 9729, NEAREST: 9728,
    TEXTURE_2D_ARRAY: 35866, TEXTURE_3D: 32879, RGBA8: 32856, DEPTH_COMPONENT24: 33190,
    DEPTH24_STENCIL8: 35056, DEPTH_STENCIL: 34041, HALF_FLOAT: 5131, RG: 33319, RED: 6403,
    RG8: 33323, R8: 33321, RGBA16F: 34842, RGBA32F: 34836, MAX_COLOR_ATTACHMENTS: 36063,
    DRAW_BUFFER0: 34853, COLOR_ATTACHMENT1: 36065, READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009,
    TRANSFORM_FEEDBACK: 36386, UNIFORM_BUFFER: 35345, TEXTURE_CUBE_MAP: 34067,
    TEXTURE_CUBE_MAP_POSITIVE_X: 34069, POINTS: 0, LINES: 1, LINE_STRIP: 3, LINE_LOOP: 2,
    TRIANGLE_STRIP: 5, TRIANGLE_FAN: 6, FRONT: 1028, BACK: 1029, FRONT_AND_BACK: 1032,
    CCW: 2305, CW: 2304, LESS: 513, LEQUAL: 515, ALWAYS: 519, NEVER: 512, EQUAL: 514,
    GEQUAL: 518, NOTEQUAL: 517, KEEP: 7680, REPLACE: 7681, INCR: 7682, DECR: 7683,
    SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771, ONE: 1, ZERO: 0, FUNC_ADD: 32774,
    MIN: 32775, MAX: 32776, TEXTURE_WRAP_R: 32882, REPEAT: 10497, CLAMP_TO_EDGE: 33071,
    MIRRORED_REPEAT: 33648, TEXTURE_MIN_LOD: 33082, TEXTURE_MAX_LOD: 33083,
    TEXTURE_BASE_LEVEL: 33084, TEXTURE_MAX_LEVEL: 33085, TEXTURE_COMPARE_MODE: 34892,
    TEXTURE_COMPARE_FUNC: 34893, COMPARE_REF_TO_TEXTURE: 34894, DEPTH_COMPONENT: 6402,
    UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125, BYTE: 5120, SHORT: 5122, INT: 5124,
    UNSIGNED_INT_24_8: 34042, DEPTH_STENCIL_ATTACHMENT: 33306, R11F_G11F_B10F: 35898,
    RGB9_E5: 35901, SRGB8_ALPHA8: 35907, SRGB8: 35905, SRGB: 35904, LUMINANCE: 6409,
    LUMINANCE_ALPHA: 6410, ALPHA: 6406, RGB565: 36194, RGBA4: 32854, RGB5_A1: 32855,
    TEXTURE_2D_MULTISAMPLE: 37122, SAMPLES: 32937, MAX_SAMPLES: 36183,
    READ_PIXELS: 0, UNPACK_ALIGNMENT: 3317, PACK_ALIGNMENT: 3333, SUBPIXEL_BITS: 3408,
    MAX_VERTEX_ATTRIBS: 34921, MAX_VERTEX_UNIFORM_VECTORS: 36347, MAX_VARYING_VECTORS: 36348,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660,
    MAX_TEXTURE_IMAGE_UNITS: 34930, MAX_FRAGMENT_UNIFORM_VECTORS: 36349,
    MAX_CUBE_MAP_TEXTURE_SIZE: 34076, MAX_RENDERBUFFER_SIZE: 34024, MAX_VIEWPORT_DIMS: 3386,
    ALIASED_LINE_WIDTH_RANGE: 33902, ALIASED_POINT_SIZE_RANGE: 33901,
    VIEWPORT: 2978, SCISSOR_BOX: 3088, COLOR_CLEAR_VALUE: 3106, DEPTH_CLEAR_VALUE: 2931,
    CURRENT_PROGRAM: 35725, FRAMEBUFFER_BINDING: 36006, RENDERBUFFER_BINDING: 36007,
    TEXTURE_BINDING_2D: 32873, ACTIVE_TEXTURE: 34016, BLEND_SRC_RGB: 32969, BLEND_DST_RGB: 32968,
    BLEND_SRC_ALPHA: 32971, BLEND_DST_ALPHA: 32970, BLEND_EQUATION_RGB: 32777,
    BLEND_EQUATION_ALPHA: 34877, BLEND_COLOR: 32773, CULL_FACE_MODE: 2885, FRONT_FACE_MODE: 2886,
    DEPTH_FUNC: 2932, DEPTH_WRITEMASK: 2930, STENCIL_FUNC: 2962, STENCIL_REF: 2967,
    STENCIL_VALUE_MASK: 2963, STENCIL_FAIL: 2964, STENCIL_PASS_DEPTH_FAIL: 2965,
    STENCIL_PASS_DEPTH_PASS: 2966, STENCIL_BACK_FUNC: 34816, STENCIL_WRITEMASK: 2968,
    STENCIL_BACK_WRITEMASK: 36005, POLYGON_OFFSET_FACTOR: 32824, POLYGON_OFFSET_UNITS: 10752,
    SAMPLE_COVERAGE_VALUE: 32926, SAMPLE_COVERAGE_INVERT: 32927, GENERATE_MIPMAP_HINT: 33170,
    IMPLEMENTATION_COLOR_READ_TYPE: 35738, IMPLEMENTATION_COLOR_READ_FORMAT: 35739,
    MAX_DRAW_BUFFERS: 34852, MAX_3D_TEXTURE_SIZE: 32883, MAX_ARRAY_TEXTURE_LAYERS: 35071,
    MIN_PROGRAM_TEXEL_OFFSET: 35076, MAX_PROGRAM_TEXEL_OFFSET: 35077, MAX_ELEMENT_INDEX: 36203,
    MAX_SERVER_WAIT_TIMEOUT: 37137, MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS: 35979,
    MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS: 35978, MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS: 35979,
    TRANSFORM_FEEDBACK_BUFFER_MODE: 35967, TRANSFORM_FEEDBACK_VARYINGS: 35971,
    MAX_UNIFORM_BUFFER_BINDINGS: 35373, MAX_UNIFORM_BLOCK_SIZE: 35376, UNIFORM_BUFFER_OFFSET_ALIGNMENT: 35380,
    MAX_VERTEX_UNIFORM_BLOCKS: 35371, MAX_FRAGMENT_UNIFORM_BLOCKS: 35370, MAX_COMBINED_UNIFORM_BLOCKS: 35374,
    MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS: 35377, MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS: 35379,
    UNIFORM_BUFFER_BINDING: 35368, MAX_VERTEX_OUTPUT_COMPONENTS: 37154,
    MAX_FRAGMENT_INPUT_COMPONENTS: 37156, MAX_VARYING_COMPONENTS: 37155,
    MAX_VERTEX_UNIFORM_COMPONENTS: 35658, MAX_FRAGMENT_UNIFORM_COMPONENTS: 35657,
    FRAGMENT_SHADER_DERIVATIVE_HINT: 35723, RASTERIZER_DISCARD: 35977,
    TEXTURE_BINDING_CUBE_MAP: 34068, TEXTURE_BINDING_2D_ARRAY: 36289, TEXTURE_BINDING_3D: 32874,
    VERTEX_ARRAY_BINDING: 34229, TRANSFORM_FEEDBACK_BINDING: 36389,
    COPY_READ_BUFFER: 36662, COPY_WRITE_BUFFER: 36663, PIXEL_PACK_BUFFER: 35051,
    PIXEL_UNPACK_BUFFER: 35052, UNIFORM_BUFFER_BINDING_2: 35368,
    FLOAT_32_UNSIGNED_INT_24_8_REV: 36269, HALF_FLOAT_OES: 36193,
    RED_INTEGER: 36244, RG_INTEGER: 33320, RGBA_INTEGER: 36249,
    TEXTURE_IMMUTABLE_FORMAT: 37167, TEXTURE_IMMUTABLE_LEVELS: 33503,
    DEPTH_COMPONENT16: 33189, DEPTH_COMPONENT32F: 36012, DEPTH32F_STENCIL8: 36013,
    STENCIL_INDEX8: 36168, STENCIL_INDEX: 6401, TEXTURE_STENCIL_SIZE: 34739,
    TEXTURE_DEPTH_SIZE: 32862, TEXTURE_ALPHA_SIZE: 32861, TEXTURE_BLUE_SIZE: 32860,
    TEXTURE_GREEN_SIZE: 32859, TEXTURE_RED_SIZE: 32858, TEXTURE_INTERNAL_FORMAT: 4099,
    TEXTURE_WIDTH: 4096, TEXTURE_HEIGHT: 4097
  };
  gl.getShaderPrecisionFormat = () => ({ rangeMin: 127, rangeMax: 127, precision: 23 });
  gl.getContextAttributes = () => ({
    alpha: false, antialias: false, depth: true, stencil: true, failIfMajorPerformanceCaveat: false,
    powerPreference: 'default', premultipliedAlpha: true, preserveDrawingBuffer: false,
    desynchronized: false, xrCompatible: false
  });
  // three.js читает gl.VERSION как свойство
  Object.defineProperty(gl, 'VERSION', { value: 7938, enumerable: false, configurable: true });
  Object.defineProperty(gl, 'SHADING_LANGUAGE_VERSION', { value: 35724, configurable: true });
  Object.defineProperty(gl, 'MAX_TEXTURE_MAX_ANISOTROPY_EXT', { value: 34047, configurable: true });
  Object.defineProperty(gl, 'UNPACK_COLORSPACE_CONVERSION_WEBGL', { value: 37443, configurable: true });
  Object.defineProperty(gl, 'BROWSER_DEFAULT_WEBGL', { value: 37444, configurable: true });
  // любой отсутствующий метод WebGL → безопасная заглушка (иначе three.js падает на экзотике)
  const noop = function () {};
  return new Proxy(gl, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string' && /^[A-Z0-9_]+$/.test(k)) return 0;
      return noop;
    }
  });
}

const doc = {
  _els: elements,
  createElement(tag) { return new El(tag); },
  createElementNS(ns, tag) { return new El(tag); },
  getElementById(id) {
    if (!elements.has(id)) { const e = new El('div'); e.id = id; elements.set(id, e); }
    return elements.get(id);
  },
  querySelector(sel) {
    const id = sel.replace(/^#/, '').replace(/[\. >].*$/, '');
    return this.getElementById(id);
  },
  querySelectorAll() { return []; },
  addEventListener() {}, removeEventListener() {},
  body: new El('body'),
  documentElement: new El('html'),
  exitPointerLock() {},
  pointerLockElement: null,
  readyState: 'complete',
  hidden: false
};
globalThis.document = doc;
globalThis.window = globalThis;
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node-smoke', maxTouchPoints: 0, platform: 'linux', mediaDevices: undefined, standalone: false, language: 'ru' },
    configurable: true, writable: true
  });
} catch (e) { console.log('navigator stub skipped'); }
const stubFetch = (u) => Promise.reject(new Error('offline stub'));
try { Object.defineProperty(globalThis, 'fetch', { value: stubFetch, configurable: true, writable: true }); } catch (e) {}
globalThis.self = globalThis;
globalThis.localStorage = {
  _d: new Map(),
  getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
  setItem(k, v) { this._d.set(k, String(v)); },
  removeItem(k) { this._d.delete(k); }
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
globalThis.confirm = () => true;
globalThis.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} };
globalThis.Audio = class { play() { return Promise.resolve(); } pause() {} };
globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
globalThis.HTMLCanvasElement = El;
globalThis.HTMLElement = El;
globalThis.Element = El;
globalThis.Node = El;
globalThis.AudioContext = undefined;
globalThis.webkitAudioContext = undefined;
globalThis.RTCPeerConnection = undefined;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};


/* ---------- дополнительные мелочи для рендер-теста ---------- */
El.prototype.appendChild = El.prototype.appendChild;
globalThis.HTMLImageElement = El;
globalThis.ImageBitmap = class { constructor(w, h) { this.width = w || 1; this.height = h || 1; } close() {} };
globalThis.createImageBitmap = () => Promise.resolve(new globalThis.ImageBitmap(1, 1));
globalThis.DOMParser = class { parseFromString() { return doc; } };
globalThis.OffscreenCanvas = El;
globalThis.Blob = globalThis.Blob || class Blob { constructor(parts, opts) { this.parts = parts; this.type = (opts && opts.type) || ''; this.size = 10; } };
globalThis.URL = globalThis.URL || {};
if (!globalThis.URL.createObjectURL) { globalThis.URL.createObjectURL = () => 'blob:stub'; globalThis.URL.revokeObjectURL = () => {}; }
globalThis.GestureEvent = undefined;
globalThis.orientation = 0;
globalThis.screen = { width: 1280, height: 720, orientation: { type: 'landscape-primary', lock: () => Promise.resolve() } };
globalThis.visualViewport = { width: 1280, height: 720, addEventListener() {}, removeEventListener() {} };

export { El, doc, elements };
