import { BUTTON_CONTENT } from "../utils/renderingShared";

const ICON_MAPPING = {
  js: "javascript",
  javascript: "javascript",
  jsx: "javascript-react",
  ts: "typescript",
  typescript: "typescript",
  tsx: "typescript-react",
  py: "python",
  python: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  cs: "csharp",
  csharp: "csharp",
  "c#": "csharp",
  go: "go",
  rust: "rust",
  php: "php",
  ruby: "ruby",
  swift: "swift",
  kotlin: "kotlin",
  dart: "dart",
  r: "r",
  lua: "lua",
  perl: "perl",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "sass",
  sass: "sass",
  less: "css",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  md: "markdown",
  markdown: "markdown",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  shell: "shell",
  dockerfile: "docker",
  docker: "docker",
  mermaid: "mermaid",
  svg: "svg",
  vue: "vue",
  angular: "angular",
  react: "javascript-react",
  vb: "vbnet",
  vbnet: "vbnet",
  matlab: "matlab",
  assembly: "assembly",
  asm: "assembly",
  clojure: "clojure",
  cobol: "cobol",
  crystal: "crystal",
  d: "dlang",
  elixir: "elixir",
  erlang: "erlang",
  fortran: "fortran",
  groovy: "groovy",
  haskell: "haskell",
  hs: "haskell",
  julia: "julia",
  lisp: "lisp",
  nim: "nim",
  objc: "objectivec",
  objectivec: "objectivec",
  ocaml: "ocaml",
  prolog: "prolog",
  solidity: "solidity",
  sol: "solidity",
  terraform: "terraform",
  tf: "terraform",
};

const ICON_STATUS = new Map();
const ICON_FALLBACK_SRC = "/icons/square-code.svg";
let iconsPreloaded = false;

const preloadCodeIcons = () => {
  if (typeof window === "undefined" || iconsPreloaded) return;
  iconsPreloaded = true;
  const iconNames = new Set(Object.values(ICON_MAPPING));
  iconNames.add("square-code");
  iconNames.forEach((iconName) => {
    const existing = ICON_STATUS.get(iconName);
    if (existing === "ok" || existing === "missing") return;
    const img = new Image();
    img.onload = () => {
      ICON_STATUS.set(iconName, "ok");
    };
    img.onerror = () => {
      ICON_STATUS.set(iconName, "missing");
    };
    img.src = `/icons/${iconName}.svg`;
  });
};

const PYODIDE_CDN_SOURCES = [
  "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js",
  "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js",
  "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js",
];

const pythonExecutionState = {
  queue: [],
  runningTask: null,
  currentOrder: 0,
  busy: false,
  tasks: new Map(),
  worker: null,
  workerReadyPromise: null,
  workerBlobUrl: null,
  workerHandlers: new Map(),
  interruptBuffer: null,
  supportsInterrupt: false,
  runId: 0,
  preloadPromise: null,
};

const resetPythonRuntime = () => {
  terminatePythonWorker();
  pythonExecutionState.queue = [];
  pythonExecutionState.runningTask = null;
  pythonExecutionState.currentOrder = 0;
  pythonExecutionState.busy = false;
  pythonExecutionState.tasks.clear();
  pythonExecutionState.runId = 0;
  if (typeof document === "undefined") return;
  const previews = document.querySelectorAll(".python-preview");
  previews.forEach((preview) => {
    resetPythonPreviewOutput(preview);
    preview.dataset.viewMode = "code";
    preview.style.display = "none";
  });
  const statuses = document.querySelectorAll(".python-status");
  statuses.forEach((statusEl) => {
    statusEl.textContent = "";
    statusEl.style.display = "none";
    statusEl.dataset.status = "";
  });
  const wrappers = document.querySelectorAll(
    ".code-block-container .code-block-wrapper",
  );
  wrappers.forEach((wrapper) => {
    wrapper.style.display = "flex";
  });
  const buttons = document.querySelectorAll("[data-python-toggle]");
  buttons.forEach((button) => {
    resetPythonButtonState(button, "code");
  });
};

const getPyodideIndexUrl = (src) => {
  if (!src) return null;
  return src.replace(/pyodide\.js(\?.*)?$/i, "");
};

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const getPyodideWorkerSource = () => {
  const sources = JSON.stringify(PYODIDE_CDN_SOURCES);
  return `
const PYODIDE_CDN_SOURCES = ${sources};
const DEFAULT_INDEX_URL = PYODIDE_CDN_SOURCES.length
  ? PYODIDE_CDN_SOURCES[0].replace(/pyodide\\.js(\\?.*)?$/i, '')
  : 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/';

let pyodide = null;
let pyodideReadyPromise = null;
let interruptBuffer = null;
let pendingInput = null;
let pendingInputTaskId = null;
let autoflushReady = false;
const cancelledTasks = new Set();

const post = (payload) => self.postMessage(payload);

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const loadPyodideScript = async () => {
  if (typeof self.loadPyodide === 'function') {
    return null;
  }
  for (const src of PYODIDE_CDN_SOURCES) {
    try {
      importScripts(src);
      if (typeof self.loadPyodide === 'function') {
        return src.replace(/pyodide\\.js(\\?.*)?$/i, '');
      }
    } catch (err) {
      // ignore and try next source
    }
  }
  throw new Error('Unable to load Pyodide from CDN.');
};

const ensurePyodideReady = async () => {
  if (pyodide) return pyodide;
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = (async () => {
      const indexURL = (await loadPyodideScript()) || DEFAULT_INDEX_URL;
      if (typeof self.loadPyodide !== 'function') {
        throw new Error('Pyodide loader is unavailable.');
      }
      const instance = await self.loadPyodide({ indexURL });
      pyodide = instance;
      if (interruptBuffer && typeof instance.setInterruptBuffer === 'function') {
        instance.setInterruptBuffer(interruptBuffer);
      }
      return instance;
    })();
  }
  return pyodideReadyPromise;
};

const setPyodideStream = (setter, handler) => {
  if (typeof setter !== 'function') return false;
  try {
    // batched 模式下每次调用 handler 时 Pyodide 会剥离换行符，需要手动添加
    setter({ batched: (text) => handler(text + '\\n') });
    return true;
  } catch (err) {}
  try {
    setter({ write: handler });
    return true;
  } catch (err) {}
  try {
    const decoder = new TextDecoder();
    setter({
      raw: (data) => {
        handler(decoder.decode(data));
      },
    });
    return true;
  } catch (err) {
    return false;
  }
};

const configurePyodideIO = (taskId) => {
  if (!pyodide) return;
  setPyodideStream((options) => pyodide.setStdout(options), (text) => {
    if (!cancelledTasks.has(taskId)) {
      post({ type: 'stdout', taskId, text });
    }
  });
  setPyodideStream((options) => pyodide.setStderr(options), (text) => {
    if (!cancelledTasks.has(taskId)) {
      post({ type: 'stderr', taskId, text });
    }
  });
  if (typeof pyodide.setStdin === 'function') {
    pyodide.setStdin({
      stdin: () => {
        if (cancelledTasks.has(taskId)) return '';
        if (!pendingInput) {
          pendingInput = createDeferred();
          pendingInputTaskId = taskId;
          post({ type: 'input-request', taskId });
        }
        return pendingInput.promise;
      },
      isatty: true,
    });
  }
};

const resetPyodideIO = () => {
  if (!pyodide) return;
  setPyodideStream((options) => pyodide.setStdout(options), () => {});
  setPyodideStream((options) => pyodide.setStderr(options), () => {});
  if (typeof pyodide.setStdin === 'function') {
    pyodide.setStdin({ stdin: () => null, isatty: true });
  }
};

const cleanupPythonState = async () => {
  if (!pyodide) return;
  try {
    await pyodide.runPythonAsync(\`
import gc
try:
    import matplotlib.pyplot as plt
    plt.close('all')
except Exception:
    pass
gc.collect()
\`);
  } catch (err) {
    // ignore cleanup failures
  }
  try {
    self.__pyodideImageCallback = () => {};
  } catch (err) {
    // ignore
  }
};

const ensureAutoFlush = async () => {
  if (autoflushReady || !pyodide) return;
  try {
    await pyodide.runPythonAsync(\`
import sys
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass
class _AutoFlush:
    def __init__(self, stream):
        self.stream = stream
    def write(self, data):
        self.stream.write(data)
        self.stream.flush()
    def flush(self):
        self.stream.flush()
    def __getattr__(self, name):
        return getattr(self.stream, name)
try:
    sys.stdout = _AutoFlush(sys.stdout)
    sys.stderr = _AutoFlush(sys.stderr)
except Exception:
    pass
\`);
    autoflushReady = true;
  } catch (err) {
    // ignore auto flush setup failures
  }
};

const detectMissingImports = async (code) => {
  if (!code || !code.trim()) return [];
  try {
    const payload = JSON.stringify(code);
    const result = await pyodide.runPythonAsync(\`
import ast, importlib.util, json
code = \${payload}
missing = []
try:
    tree = ast.parse(code)
    modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name:
                    modules.add(alias.name.split('.')[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                modules.add(node.module.split('.')[0])
    for name in sorted(modules):
        try:
            if importlib.util.find_spec(name) is None:
                missing.append(name)
        except Exception:
            missing.append(name)
except Exception:
    missing = []
json.dumps(missing)
\`);
    return JSON.parse(result || '[]');
  } catch (err) {
    return [];
  }
};

const installDependencies = async (code) => {
  try {
    if (typeof pyodide.loadPackagesFromImports === 'function') {
      await pyodide.loadPackagesFromImports(code);
    }
  } catch (err) {
    // ignore
  }
  const remaining = await detectMissingImports(code);
  const filtered = remaining.filter((name) => name && name !== 'micropip');
  const needsMicropip = remaining.includes('micropip') || filtered.length > 0;
  if (!needsMicropip) return;
  await pyodide.loadPackage('micropip');
  if (filtered.length === 0) return;
  await pyodide.runPythonAsync(\`
import micropip
await micropip.install(\${JSON.stringify(filtered)})
\`);
};

const shouldSetupMatplotlib = (code) => {
  if (!code) return false;
  return /(^|\\n)\\s*(import|from)\\s+matplotlib\\b/.test(code);
};

const MATPLOTLIB_SETUP_CODE = \`
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from io import BytesIO
    import base64, js
    # Set larger default figure size and higher DPI for better quality
    plt.rcParams['figure.figsize'] = [10, 6]
    plt.rcParams['figure.dpi'] = 100
    plt.rcParams['savefig.dpi'] = 150
    def __pyodide_show():
        buf = BytesIO()
        plt.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor='white', edgecolor='none')
        buf.seek(0)
        data = base64.b64encode(buf.read()).decode("ascii")
        js.__pyodideImageCallback(data)
        plt.close()
    plt.show = __pyodide_show
except Exception:
    pass
\`;

const runTask = async (taskId, code) => {
  const assertNotCancelled = () => {
    if (cancelledTasks.has(taskId)) {
      throw new Error('Python execution cancelled');
    }
  };

  try {
    post({ type: 'status', taskId, label: 'Setting up Python environment' });
    await ensurePyodideReady();
    assertNotCancelled();
    await ensureAutoFlush();

    const missing = await detectMissingImports(code);
    assertNotCancelled();
    if (missing.length > 0) {
      post({ type: 'status', taskId, label: 'Installing dependencies' });
      await installDependencies(code);
      assertNotCancelled();
    }

    post({ type: 'clear', taskId });
    configurePyodideIO(taskId);
    self.__pyodideImageCallback = (data) => {
      if (!cancelledTasks.has(taskId)) {
        post({ type: 'image', taskId, data });
      }
    };

    if (shouldSetupMatplotlib(code)) {
      await pyodide.runPythonAsync(MATPLOTLIB_SETUP_CODE);
      assertNotCancelled();
    }

    const codeWithFlush = code + '\\nprint()  # force flush\\nimport sys; sys.stdout.flush()';
    const result = await pyodide.runPythonAsync(codeWithFlush);
    assertNotCancelled();
    if (typeof result !== 'undefined' && result !== null) {
      let textResult = '';
      if (pyodide && typeof pyodide.isPyProxy === 'function' && pyodide.isPyProxy(result)) {
        textResult = result.toString();
        result.destroy();
      } else {
        textResult = String(result);
      }
      if (textResult && textResult !== 'None') {
        post({ type: 'result', taskId, result: textResult });
      }
    }
    post({ type: 'done', taskId });
  } catch (err) {
    const message = err?.message || String(err || 'Python execution failed.');
    post({ type: 'done', taskId, error: message });
  } finally {
    resetPyodideIO();
    await cleanupPythonState();
    cancelledTasks.delete(taskId);
  }
};

self.onmessage = (event) => {
  const data = event.data || {};
  if (data.type === 'init') {
    interruptBuffer = data.interruptBuffer || null;
    if (interruptBuffer && pyodide && typeof pyodide.setInterruptBuffer === 'function') {
      pyodide.setInterruptBuffer(interruptBuffer);
    }
    post({ type: 'ready' });
    return;
  }
  if (data.type === 'preload') {
    ensurePyodideReady()
      .then(() => post({ type: 'preloaded' }))
      .catch((err) => {
        post({ type: 'preload-error', error: err?.message || String(err || 'Pyodide preload failed') });
      });
    return;
  }
  if (data.type === 'stdin') {
    if (pendingInput && pendingInputTaskId === data.taskId) {
      const value = typeof data.value === 'string' ? data.value : '';
      pendingInput.resolve(value);
      pendingInput = null;
      pendingInputTaskId = null;
    }
    return;
  }
  if (data.type === 'cancel') {
    if (data.taskId) {
      cancelledTasks.add(data.taskId);
      if (pendingInput && pendingInputTaskId === data.taskId) {
        pendingInput.resolve('');
        pendingInput = null;
        pendingInputTaskId = null;
      }
    }
    if (interruptBuffer) {
      interruptBuffer[0] = 2;
    }
    const mod = pyodide?._module;
    if (mod) {
      if (typeof mod.PyErr_SetInterrupt === 'function') {
        mod.PyErr_SetInterrupt();
      }
      if (typeof mod._PyErr_SetInterrupt === 'function') {
        mod._PyErr_SetInterrupt();
      }
    }
    return;
  }
  if (data.type === 'run') {
    const taskId = data.taskId;
    const code = data.code || '';
    if (taskId) {
      cancelledTasks.delete(taskId);
      runTask(taskId, code);
    }
  }
};
`;
};

const ensurePythonWorker = async () => {
  if (pythonExecutionState.workerReadyPromise) {
    return pythonExecutionState.workerReadyPromise;
  }
  if (typeof window === "undefined") {
    throw new Error("Pyodide requires a browser environment.");
  }
  pythonExecutionState.workerReadyPromise = new Promise((resolve, reject) => {
    try {
      const workerSource = getPyodideWorkerSource();
      const blob = new Blob([workerSource], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      const worker = new Worker(blobUrl);
      pythonExecutionState.worker = worker;
      pythonExecutionState.workerBlobUrl = blobUrl;
      pythonExecutionState.workerHandlers = new Map();

      const handleMessage = (event) => {
        const payload = event.data || {};
        if (payload.type === "ready") {
          resolve();
          return;
        }
        if (payload.taskId) {
          const handler = pythonExecutionState.workerHandlers.get(
            payload.taskId,
          );
          if (handler) {
            handler(payload);
            return;
          }
        }
      };

      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", (err) => {
        console.error("Pyodide worker error:", err);
        reject(err);
      });

      if (typeof SharedArrayBuffer !== "undefined") {
        pythonExecutionState.interruptBuffer = new Int32Array(
          new SharedArrayBuffer(4),
        );
        pythonExecutionState.supportsInterrupt = true;
      } else {
        pythonExecutionState.interruptBuffer = null;
        pythonExecutionState.supportsInterrupt = false;
      }
      worker.postMessage({
        type: "init",
        interruptBuffer: pythonExecutionState.interruptBuffer,
      });
    } catch (err) {
      reject(err);
    }
  });
  pythonExecutionState.workerReadyPromise.catch(() => {
    terminatePythonWorker();
  });
  return pythonExecutionState.workerReadyPromise;
};

const warmupPyodideDownload = () => {
  if (pythonExecutionState.preloadPromise)
    return pythonExecutionState.preloadPromise;
  pythonExecutionState.preloadPromise = (async () => {
    try {
      await ensurePythonWorker();
      const worker = pythonExecutionState.worker;
      if (worker) {
        worker.postMessage({ type: "preload" });
      }
    } catch (err) {
      console.debug("Pyodide preload skipped:", err);
    }
  })();
  return pythonExecutionState.preloadPromise;
};

const terminatePythonWorker = () => {
  if (pythonExecutionState.worker) {
    pythonExecutionState.worker.terminate();
  }
  if (pythonExecutionState.workerBlobUrl) {
    URL.revokeObjectURL(pythonExecutionState.workerBlobUrl);
  }
  pythonExecutionState.worker = null;
  pythonExecutionState.workerReadyPromise = null;
  pythonExecutionState.workerBlobUrl = null;
  pythonExecutionState.workerHandlers = new Map();
  pythonExecutionState.preloadPromise = null;
};

const forceInterruptPyodide = (taskId) => {
  if (pythonExecutionState.interruptBuffer) {
    if (typeof Atomics !== "undefined" && typeof Atomics.store === "function") {
      Atomics.store(pythonExecutionState.interruptBuffer, 0, 2);
      if (typeof Atomics.notify === "function") {
        Atomics.notify(pythonExecutionState.interruptBuffer, 0);
      }
    } else {
      pythonExecutionState.interruptBuffer[0] = 2;
    }
  }
  const worker = pythonExecutionState.worker;
  if (worker) {
    worker.postMessage({ type: "cancel", taskId });
  }
  if (
    !pythonExecutionState.supportsInterrupt &&
    pythonExecutionState.worker &&
    taskId
  ) {
    terminatePythonWorker();
  }
};

const setPythonBusyState = (busy) => {
  pythonExecutionState.busy = busy;
  if (typeof document === "undefined") return;
  const buttons = document.querySelectorAll("[data-python-toggle]");
  buttons.forEach((button) => {
    if (button.getAttribute("data-python-mode") !== "code") return;
    button.innerHTML = busy ? BUTTON_CONTENT.RUN_BUSY : BUTTON_CONTENT.RUN_ON;
  });
};

const getPythonElementsByUid = (pythonUid) => {
  if (typeof document === "undefined") return null;
  const block = document.querySelector(
    `.code-block-container[data-python-uid="${pythonUid}"]`,
  );
  if (!block) return null;
  return {
    block,
    preview: block.querySelector(".python-preview"),
    button: block.querySelector(`[data-python-toggle="${pythonUid}"]`),
    codeWrapper: block.querySelector(".code-block-wrapper"),
    status: block.querySelector(".python-status"),
  };
};

const PYTHON_STATUS_CONFIG = {
  running: { text: "Running", color: "#f59e0b" },
  completed: { text: "Completed.", color: "#22c55e" },
  error: { text: "Error.", color: "#ef4444" },
  waiting: { text: "Waiting...", color: "#3b82f6" },
};

const setPythonStatus = (pythonUid, statusKey) => {
  if (!pythonUid) return;
  const elements = getPythonElementsByUid(pythonUid);
  if (!elements?.status) return;
  const config =
    PYTHON_STATUS_CONFIG[statusKey] || PYTHON_STATUS_CONFIG.waiting;
  elements.status.innerHTML = "";
  const label = document.createElement("span");
  label.textContent = config.text + (statusKey === "running" ? " " : "");
  elements.status.appendChild(label);
  if (statusKey === "running") {
    const spinner = document.createElement("span");
    spinner.className = "python-terminal-spinner";
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    frames.forEach((frame) => {
      const frameSpan = document.createElement("span");
      frameSpan.textContent = frame;
      spinner.appendChild(frameSpan);
    });
    elements.status.appendChild(document.createTextNode(" "));
    elements.status.appendChild(spinner);
  }
  elements.status.style.color = config.color;
  elements.status.style.display = "inline-flex";
  elements.status.dataset.status = statusKey;
};

const hidePythonStatus = (pythonUid) => {
  if (!pythonUid) return;
  const elements = getPythonElementsByUid(pythonUid);
  if (!elements?.status) return;
  elements.status.textContent = "";
  elements.status.style.display = "none";
  elements.status.dataset.status = "";
};

const cleanupPythonStatusForInactive = (activePythonKeys) => {
  if (typeof document === "undefined") return;
  const root = document;
  const statusNodes = root.querySelectorAll(
    ".code-block-container[data-python-uid]",
  );
  statusNodes.forEach((container) => {
    const pythonUid = container.getAttribute("data-python-uid");
    if (!pythonUid || activePythonKeys.has(pythonUid)) return;
    const statusEl = container.querySelector(".python-status");
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.style.display = "none";
      statusEl.dataset.status = "";
    }
  });
  pythonExecutionState.tasks.forEach((_, key) => {
    if (!activePythonKeys.has(key)) {
      pythonExecutionState.tasks.delete(key);
    }
  });
  if (
    pythonExecutionState.runningTask &&
    !activePythonKeys.has(pythonExecutionState.runningTask.pythonUid)
  ) {
    cancelPythonTask(pythonExecutionState.runningTask.pythonUid);
  }
};

const createPythonTerminalController = (previewEl) => {
  const outputEl = previewEl.querySelector(".python-terminal-output");
  const state = {
    currentLineEl: null,
    pendingInput: null,
    spinners: new Set(),
    userScrolledUp: false,
  };

  // 检测用户是否接近底部（允许 30px 的误差）
  const isNearBottom = () => {
    if (!outputEl) return true;
    const threshold = 30;
    return (
      outputEl.scrollHeight - outputEl.scrollTop - outputEl.clientHeight <
      threshold
    );
  };

  // 监听滚动事件来检测用户是否向上滚动
  const handleScroll = () => {
    state.userScrolledUp = !isNearBottom();
  };

  // 添加滚动监听
  if (outputEl) {
    outputEl.addEventListener("scroll", handleScroll, { passive: true });
  }

  const scrollToBottom = (force = false) => {
    // 如果用户向上滚动了，除非强制，否则不自动滚动
    if (state.userScrolledUp && !force) return;
    outputEl.scrollTop = outputEl.scrollHeight;
  };

  const clearSpinners = () => {
    state.spinners.forEach((spinner) => spinner.stop());
    state.spinners.clear();
  };

  const clear = () => {
    clearSpinners();
    if (state.pendingInput) {
      state.pendingInput.resolve("");
      state.pendingInput = null;
    }
    state.currentLineEl = null;
    state.userScrolledUp = false; // 重置滚动状态，新执行重新开始自动滚动
    outputEl.innerHTML = "";
  };

  const ensureLine = (className) => {
    if (!state.currentLineEl) {
      const line = document.createElement("div");
      line.className = `python-terminal-line${className ? ` ${className}` : ""}`;
      outputEl.appendChild(line);
      state.currentLineEl = line;
    }
    return state.currentLineEl;
  };

  const write = (text, options = {}) => {
    if (!outputEl) return;
    const { isError = false } = options;
    if (isError) {
      state.currentLineEl = null;
    }
    const content = String(text ?? "");
    if (!content) return;
    const segments = content.split("\n");
    segments.forEach((segment, idx) => {
      if (segment.length === 0 && idx === segments.length - 1) {
        return;
      }
      const line = ensureLine(isError ? "python-terminal-error" : "");
      const span = document.createElement("span");
      span.textContent = segment;
      line.appendChild(span);
      if (idx < segments.length - 1) {
        state.currentLineEl = null;
      }
    });
    scrollToBottom();
  };

  const writeLine = (text, className) => {
    const line = document.createElement("div");
    line.className = `python-terminal-line${className ? ` ${className}` : ""}`;
    line.textContent = text;
    outputEl.appendChild(line);
    state.currentLineEl = null;
    scrollToBottom();
  };

  const startSpinner = (label) => {
    const line = document.createElement("div");
    line.className = "python-terminal-line python-terminal-status";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = `${label} `;
    const spinnerSpan = document.createElement("span");
    spinnerSpan.className = "python-terminal-spinner";
    // 创建10个盲文帧，CSS动画会控制它们的显示/隐藏
    // 使用CSS动画而非JavaScript setInterval，确保主线程阻塞时动画继续运行
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    frames.forEach((frame) => {
      const frameSpan = document.createElement("span");
      frameSpan.textContent = frame;
      spinnerSpan.appendChild(frameSpan);
    });
    line.appendChild(labelSpan);
    line.appendChild(spinnerSpan);
    outputEl.appendChild(line);

    const spinner = {
      stop: () => {
        if (line.parentNode) {
          line.remove();
        }
        state.spinners.delete(spinner);
      },
    };
    state.spinners.add(spinner);
    scrollToBottom();
    return spinner;
  };

  const requestInput = () => {
    if (state.pendingInput) return state.pendingInput.promise;
    const line = state.currentLineEl || document.createElement("div");
    if (!state.currentLineEl) {
      line.className = "python-terminal-line";
      outputEl.appendChild(line);
    }
    line.classList.add("python-terminal-input-line");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "python-terminal-input";
    input.autocomplete = "off";
    input.spellcheck = false;
    line.appendChild(input);
    scrollToBottom();
    input.focus();

    let resolveFn;
    const promise = new Promise((resolve) => {
      resolveFn = resolve;
    });
    const finalize = () => {
      const value = input.value ?? "";
      input.remove();
      line.classList.remove("python-terminal-input-line");
      const textSpan = document.createElement("span");
      textSpan.textContent = value;
      line.appendChild(textSpan);
      state.currentLineEl = null;
      state.pendingInput = null;
      scrollToBottom();
      resolveFn(`${value}\n`);
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finalize();
      }
    });

    state.pendingInput = { promise, resolve: resolveFn, line, input };
    return promise;
  };

  const cancelInput = () => {
    if (!state.pendingInput) return;
    const { resolve, line, input } = state.pendingInput;
    if (input) input.remove();
    if (line) line.classList.remove("python-terminal-input-line");
    resolve("");
    state.pendingInput = null;
  };

  const setQueuedMessage = (message) => {
    clear();
    writeLine(message, "python-terminal-queued");
  };

  const appendImage = (base64Data) => {
    if (!base64Data) return;
    const img = document.createElement("img");
    img.src = `data:image/png;base64,${base64Data}`;
    img.className = "python-terminal-image";
    outputEl.appendChild(img);
    state.currentLineEl = null;
    scrollToBottom();
  };

  return {
    clear,
    write,
    writeLine,
    startSpinner,
    requestInput,
    cancelInput,
    setQueuedMessage,
    appendImage,
  };
};

const getTerminalForTask = (task) => {
  const elements = getPythonElementsByUid(task.pythonUid);
  if (!elements?.preview) return null;
  if (!elements.preview._terminalController) {
    elements.preview._terminalController = createPythonTerminalController(
      elements.preview,
    );
  }
  return elements.preview._terminalController;
};

const resetPythonPreviewOutput = (previewEl) => {
  if (!previewEl) return;
  if (previewEl._terminalController) {
    previewEl._terminalController.clear();
    previewEl._terminalController = null;
  }
  const outputEl = previewEl.querySelector(".python-terminal-output");
  if (outputEl) {
    const freshOutput = outputEl.cloneNode(false);
    outputEl.replaceWith(freshOutput);
  }
};

const resetPythonButtonState = (button, mode) => {
  if (!button) return;
  button.setAttribute("data-python-mode", mode);
  if (mode === "code") {
    button.innerHTML = pythonExecutionState.busy
      ? BUTTON_CONTENT.RUN_BUSY
      : BUTTON_CONTENT.RUN_ON;
  } else {
    button.innerHTML = BUTTON_CONTENT.RUN_OFF;
  }
};

const detectMissingImports = async (pyodide, code) => {
  if (!code || !code.trim()) return [];
  try {
    const payload = JSON.stringify(code);
    const result = await pyodide.runPythonAsync(`
import ast, importlib.util, json
code = ${payload}
missing = []
try:
    tree = ast.parse(code)
    modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name:
                    modules.add(alias.name.split('.')[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                modules.add(node.module.split('.')[0])
    for name in sorted(modules):
        try:
            if importlib.util.find_spec(name) is None:
                missing.append(name)
        except Exception:
            missing.append(name)
except Exception:
    missing = []
json.dumps(missing)
`);
    return JSON.parse(result || "[]");
  } catch (err) {
    return [];
  }
};

const installDependencies = async (pyodide, code) => {
  try {
    if (typeof pyodide.loadPackagesFromImports === "function") {
      await pyodide.loadPackagesFromImports(code);
    }
  } catch (err) {
    // Ignore and try micropip for remaining packages
  }
  const remaining = await detectMissingImports(pyodide, code);
  const filtered = remaining.filter((name) => name && name !== "micropip");
  const needsMicropip = remaining.includes("micropip") || filtered.length > 0;
  if (!needsMicropip) return;
  await pyodide.loadPackage("micropip");
  if (filtered.length === 0) return;
  await pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(filtered)})
`);
};

const setPyodideStream = (setter, handler) => {
  if (typeof setter !== "function") return false;
  try {
    // batched 模式下每次调用 handler 时 Pyodide 会剥离换行符，需要手动添加
    setter({ batched: (text) => handler(text + "\n") });
    return true;
  } catch (err) {
    // ignore and fallback
  }
  try {
    setter({ write: handler });
    return true;
  } catch (err) {
    // ignore and fallback
  }
  try {
    const decoder = new TextDecoder();
    setter({
      raw: (data) => {
        handler(decoder.decode(data));
      },
    });
    return true;
  } catch (err) {
    return false;
  }
};

const configurePyodideIO = (pyodide, terminal, task) => {
  if (!pyodide || !terminal) return;
  // 使用箭头函数包装以保留pyodide的this上下文
  setPyodideStream(
    (options) => pyodide.setStdout(options),
    (text) => {
      if (!task.cancelled) terminal.write(text);
    },
  );
  setPyodideStream(
    (options) => pyodide.setStderr(options),
    (text) => {
      if (!task.cancelled) terminal.write(text, { isError: true });
    },
  );
  if (typeof pyodide.setStdin === "function") {
    pyodide.setStdin({
      stdin: async () => {
        if (task.cancelled) return "";
        return terminal.requestInput();
      },
      isatty: true,
    });
  }
};

const resetPyodideIO = (pyodide) => {
  if (!pyodide) return;
  // 使用箭头函数包装以保留pyodide的this上下文
  setPyodideStream(
    (options) => pyodide.setStdout(options),
    () => {},
  );
  setPyodideStream(
    (options) => pyodide.setStderr(options),
    () => {},
  );
  if (typeof pyodide.setStdin === "function") {
    pyodide.setStdin({ stdin: () => null, isatty: true });
  }
};

const shouldSetupMatplotlib = (code) => {
  if (!code) return false;
  return /(^|\n)\s*(import|from)\s+matplotlib\b/.test(code);
};

const MATPLOTLIB_SETUP_CODE = `
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from io import BytesIO
    import base64, js
    def __pyodide_show():
        buf = BytesIO()
        plt.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        data = base64.b64encode(buf.read()).decode("ascii")
        js.__pyodideImageCallback(data)
        plt.close()
    plt.show = __pyodide_show
except Exception:
    pass
`;

const raceWithCancel = (promise, task) => {
  if (!task?.cancelSignal) return promise;
  return Promise.race([
    promise,
    task.cancelSignal.promise.then(() => {
      throw new Error("Python execution cancelled");
    }),
  ]);
};

const runPythonTask = async (task) => {
  const terminal = getTerminalForTask(task);
  if (!terminal) return;
  terminal.clear();
  let spinner = terminal.startSpinner("Setting up Python environment");
  let spinnerLabel = "Setting up Python environment";
  const updateSpinner = (label) => {
    if (!label || label === spinnerLabel) return;
    if (spinner) spinner.stop();
    spinnerLabel = label;
    spinner = terminal.startSpinner(label);
  };
  const stopSpinner = () => {
    if (!spinner) return;
    spinner.stop();
    spinner = null;
  };
  const runId = ++pythonExecutionState.runId;
  task.runId = runId;
  let outcome = "completed";
  try {
    await ensurePythonWorker();
    if (pythonExecutionState.interruptBuffer) {
      pythonExecutionState.interruptBuffer[0] = 0;
    }
    if (task.cancelled) throw new Error("Python execution cancelled");
    const worker = pythonExecutionState.worker;
    if (!worker) throw new Error("Python worker unavailable.");
    const runPromise = new Promise((resolve) => {
      pythonExecutionState.workerHandlers.set(runId, (payload) => {
        if (task.cancelled && payload.type !== "done") return;
        switch (payload.type) {
          case "status":
            updateSpinner(payload.label);
            break;
          case "clear":
            stopSpinner();
            terminal.clear();
            break;
          case "stdout":
            stopSpinner();
            terminal.write(payload.text);
            break;
          case "stderr":
            stopSpinner();
            terminal.write(payload.text, { isError: true });
            break;
          case "image":
            stopSpinner();
            terminal.appendImage(payload.data);
            break;
          case "result":
            stopSpinner();
            terminal.writeLine(payload.result);
            break;
          case "input-request":
            stopSpinner();
            terminal.requestInput().then((value) => {
              if (task.cancelled) return;
              if (pythonExecutionState.worker) {
                pythonExecutionState.worker.postMessage({
                  type: "stdin",
                  taskId: runId,
                  value,
                });
              }
            });
            break;
          case "done":
            if (!task.cancelled && payload.error) {
              outcome = "error";
              terminal.write(payload.error, { isError: true });
            }
            resolve();
            break;
          default:
            break;
        }
      });
    });
    worker.postMessage({ type: "run", taskId: runId, code: task.code });
    await raceWithCancel(runPromise, task);
  } catch (err) {
    if (task.cancelled) return;
    outcome = "error";
    const message = err?.message || String(err || "Python execution failed.");
    terminal.write(message, { isError: true });
  } finally {
    stopSpinner();
    terminal.cancelInput();
    pythonExecutionState.workerHandlers.delete(runId);
  }
  return outcome;
};

const updateQueuedMessages = () => {
  if (!pythonExecutionState.runningTask) return;
  const currentOrder = pythonExecutionState.currentOrder || 1;
  pythonExecutionState.queue.forEach((task, index) => {
    const order = currentOrder + index + 1;
    const terminal = getTerminalForTask(task);
    if (terminal) {
      terminal.setQueuedMessage(
        `Queued. Will run after current execution. [${currentOrder}/${order}]`,
      );
    }
    setPythonStatus(task.pythonUid, "waiting");
  });
};

const startNextPythonTask = async () => {
  if (
    pythonExecutionState.runningTask ||
    pythonExecutionState.queue.length === 0
  )
    return;
  const task = pythonExecutionState.queue.shift();
  if (!task) return;
  pythonExecutionState.runningTask = task;
  task.status = "running";
  pythonExecutionState.tasks.set(task.pythonUid, task);
  setPythonStatus(task.pythonUid, "running");
  updateQueuedMessages();
  const outcome = await runPythonTask(task);
  pythonExecutionState.runningTask = null;
  task.status = task.cancelled ? "cancelled" : "done";
  pythonExecutionState.tasks.set(task.pythonUid, task);
  if (!task.cancelled) {
    setPythonStatus(
      task.pythonUid,
      outcome === "error" ? "error" : "completed",
    );
  }

  if (pythonExecutionState.queue.length > 0) {
    pythonExecutionState.currentOrder =
      (pythonExecutionState.currentOrder || 1) + 1;
    startNextPythonTask();
  } else {
    pythonExecutionState.currentOrder = 0;
    setPythonBusyState(false);
  }
};

const enqueuePythonTask = (task) => {
  if (!task?.pythonUid) return;
  const existing = pythonExecutionState.tasks.get(task.pythonUid);
  if (
    existing &&
    (existing.status === "running" || existing.status === "queued")
  )
    return;
  if (typeof task.cancelled !== "boolean") {
    task.cancelled = false;
  }
  if (!task.cancelSignal) {
    task.cancelSignal = createDeferred();
  }
  task.status = "queued";
  pythonExecutionState.tasks.set(task.pythonUid, task);
  if (
    !pythonExecutionState.runningTask &&
    pythonExecutionState.queue.length === 0
  ) {
    pythonExecutionState.currentOrder = 1;
  }
  pythonExecutionState.queue.push(task);
  setPythonBusyState(true);
  setPythonStatus(task.pythonUid, "waiting");
  updateQueuedMessages();
  if (!pythonExecutionState.runningTask) {
    startNextPythonTask();
  }
};

const cancelPythonTask = (pythonUid) => {
  if (!pythonUid) return;
  const queuedIndex = pythonExecutionState.queue.findIndex(
    (task) => task.pythonUid === pythonUid,
  );
  if (queuedIndex >= 0) {
    const [task] = pythonExecutionState.queue.splice(queuedIndex, 1);
    if (task) {
      task.cancelled = true;
      task.status = "cancelled";
      pythonExecutionState.tasks.set(task.pythonUid, task);
      if (task.cancelSignal) {
        task.cancelSignal.resolve();
      }
      const terminal = getTerminalForTask(task);
      terminal?.clear();
    }
    updateQueuedMessages();
  }

  const runningTask = pythonExecutionState.runningTask;
  if (runningTask && runningTask.pythonUid === pythonUid) {
    runningTask.cancelled = true;
    runningTask.status = "cancelled";
    pythonExecutionState.tasks.set(runningTask.pythonUid, runningTask);
    if (runningTask.cancelSignal) {
      runningTask.cancelSignal.resolve();
    }
    forceInterruptPyodide(runningTask.runId);
    const terminal = getTerminalForTask(runningTask);
    terminal?.cancelInput();
  }

  if (
    !pythonExecutionState.runningTask &&
    pythonExecutionState.queue.length === 0
  ) {
    setPythonBusyState(false);
    pythonExecutionState.currentOrder = 0;
  }
};

export {
  ICON_FALLBACK_SRC,
  ICON_MAPPING,
  ICON_STATUS,
  PYTHON_STATUS_CONFIG,
  cancelPythonTask,
  cleanupPythonStatusForInactive,
  createDeferred,
  enqueuePythonTask,
  hidePythonStatus,
  preloadCodeIcons,
  pythonExecutionState,
  resetPythonButtonState,
  resetPythonPreviewOutput,
  resetPythonRuntime,
  setPythonStatus,
  warmupPyodideDownload,
};
