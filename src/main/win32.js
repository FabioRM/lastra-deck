// @ts-check
'use strict';

// Shared Win32 bindings for the *-win32 modules. Koffi rejects a second named type with the
// same name, and every module used to load the same DLLs and declare the same functions, so
// each library, function and named type is declared here once, on first use. Requiring this
// module loads nothing, so it is safe on every platform; calling into it off Windows throws.

/** @typedef {typeof import('koffi')} Koffi */
/** @typedef {ReturnType<import('koffi').LibraryHandle['func']>} Win32Function */

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

// Prototypes use the named types declared in loadTypes().
const PROTOTYPES = {
  user32: [
    'void * __stdcall GetForegroundWindow()',
    'uint32_t __stdcall GetWindowThreadProcessId(void *, _Out_ uint32_t *)',
    'int32_t __stdcall GetWindowTextW(void *, void *, int32_t)',
    'int32_t __stdcall GetWindowTextLengthW(void *)',
    'int32_t __stdcall GetClassNameW(void *, void *, int32_t)',
    'int32_t __stdcall IsWindowVisible(void *)',
    'int32_t __stdcall IsIconic(void *)',
    'int32_t __stdcall IsZoomed(void *)',
    'int32_t __stdcall GetWindowRect(void *, void *)',
    'int32_t __stdcall SetWindowPos(void *, void *, int32_t, int32_t, int32_t, int32_t, uint32_t)',
    'int32_t __stdcall ShowWindowAsync(void *, int32_t)',
    'int32_t __stdcall SetForegroundWindow(void *)',
    'int32_t __stdcall EnumWindows(LASTRA_WNDENUMPROC *, intptr_t)',
    'void * __stdcall GetWindow(void *, uint32_t)',
    'void * __stdcall GetAncestor(void *, uint32_t)',
    'uintptr_t __stdcall GetKeyboardLayout(uint32_t)',
    'int32_t __stdcall GetGUIThreadInfo(uint32_t, void *)',
    'int32_t __stdcall GetPhysicalCursorPos(void *)',
    'void * __stdcall MonitorFromWindow(void *, uint32_t)',
    'int32_t __stdcall GetMonitorInfoW(void *, _Inout_ LASTRA_MONITORINFOEXW *)',
    'int32_t __stdcall EnumDisplayDevicesW(str16, uint32_t, _Inout_ LASTRA_DISPLAY_DEVICEW *, uint32_t)',
    'int32_t __stdcall GetPointerDevices(_Inout_ uint32_t *, void *)',
    'int32_t __stdcall GetPointerDeviceRects(void *, _Out_ LASTRA_RECT *, _Out_ LASTRA_RECT *)',
  ],
  kernel32: [
    'void * __stdcall OpenProcess(uint32_t, int32_t, uint32_t)',
    'int32_t __stdcall CloseHandle(void *)',
    'int32_t __stdcall QueryFullProcessImageNameW(void *, uint32_t, void *, _Inout_ uint32_t *)',
    'int32_t __stdcall GetApplicationUserModelId(void *, _Inout_ uint32_t *, void *)',
    'int32_t __stdcall GetProcessTimes(void *, void *, void *, void *, void *)',
    'int32_t __stdcall K32GetProcessMemoryInfo(void *, void *, uint32_t)',
  ],
  dwmapi: [
    'int32_t __stdcall DwmGetWindowAttribute(void *, uint32_t, _Out_ uint32_t *, uint32_t)',
  ],
  shell32: [
    'int32_t __stdcall SHGetPropertyStoreForWindow(void *, void *, _Out_ void **)',
  ],
  ole32: [
    'int32_t __stdcall CoInitializeEx(void *, uint32_t)',
    'void __stdcall CoUninitialize()',
    'int32_t __stdcall CoCreateInstance(void *, void *, uint32_t, void *, _Out_ void **)',
    'void __stdcall CoTaskMemFree(void *)',
    'int32_t __stdcall CLSIDFromString(str16, void *)',
    'int32_t __stdcall PropVariantClear(void *)',
  ],
  dxva2: [
    'int32_t __stdcall GetNumberOfPhysicalMonitorsFromHMONITOR(void *, _Out_ uint32_t *)',
    'int32_t __stdcall GetPhysicalMonitorsFromHMONITOR(void *, uint32_t, void *)',
    'int32_t __stdcall DestroyPhysicalMonitor(void *)',
    'int32_t __stdcall GetMonitorBrightness(void *, _Out_ uint32_t *, _Out_ uint32_t *, _Out_ uint32_t *)',
    'int32_t __stdcall SetMonitorBrightness(void *, uint32_t)',
  ],
};

/** @type {Map<string, { library: string, prototype: string }>} */
const DECLARATIONS = new Map(Object.entries(PROTOTYPES).flatMap(([library, prototypes]) =>
  prototypes.map((prototype) => [/(\w+)\(/.exec(prototype)[1], { library, prototype }])));

/**
 * @typedef {object} Win32State
 * @property {Koffi} koffi
 * @property {ReturnType<typeof loadTypes>} types
 * @property {number} pointerSize
 * @property {Map<string, import('koffi').LibraryHandle>} libraries
 * @property {Map<string, Win32Function>} functions
 */

/** @type {Win32State | undefined} */
let state;

/** @param {Koffi} koffi */
function loadTypes(koffi) {
  const RECT = koffi.struct('LASTRA_RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
  return {
    RECT,
    MONITORINFOEXW: koffi.struct('LASTRA_MONITORINFOEXW', {
      size: 'uint32_t', bounds: RECT, work: RECT, flags: 'uint32_t', name: koffi.array('char16_t', 32, 'String'),
    }),
    DISPLAY_DEVICEW: koffi.struct('LASTRA_DISPLAY_DEVICEW', {
      size: 'uint32_t', name: koffi.array('char16_t', 32, 'String'), description: koffi.array('char16_t', 128, 'String'),
      flags: 'uint32_t', id: koffi.array('char16_t', 128, 'String'), key: koffi.array('char16_t', 128, 'String'),
    }),
    PHYSICAL_MONITOR: koffi.struct('LASTRA_PHYSICAL_MONITOR', { handle: 'void *', name: koffi.array('char16_t', 128, 'String') }),
    POINTER_DEVICE_INFO: koffi.struct('LASTRA_POINTER_DEVICE_INFO', {
      orientation: 'uint32_t',
      device: 'void *',
      type: 'uint32_t',
      monitor: 'void *',
      startingCursorId: 'uint32_t',
      maxActiveContacts: 'uint16_t',
      product: koffi.array('char16_t', 520, 'String'),
    }),
    WNDENUMPROC: koffi.proto('int32_t __stdcall LASTRA_WNDENUMPROC(void *, intptr_t)'),
    // IUnknown::Release and IPropertyStore::GetValue.
    release: koffi.proto('__stdcall', 'uint32_t', ['void *']),
    getProperty: koffi.proto('__stdcall', 'int32_t', ['void *', 'void *', 'void *']),
  };
}

/**
 * Load koffi and the shared named types. Throws off Windows.
 * @returns {Win32State}
 */
function load() {
  if (process.platform !== 'win32') throw new Error('Win32 bindings are only available on Windows');
  if (!state) {
    const koffi = require('koffi');
    state = { koffi, types: loadTypes(koffi), pointerSize: koffi.sizeof('void *'), libraries: new Map(), functions: new Map() };
  }
  return state;
}

/**
 * Return the shared binding for a Win32 function listed in PROTOTYPES.
 * @param {string} name
 * @returns {Win32Function}
 */
function fn(name) {
  const { koffi, libraries, functions } = load();
  let binding = functions.get(name);
  if (binding) return binding;
  const declaration = DECLARATIONS.get(name);
  if (!declaration) throw new Error(`Unknown Win32 function ${name}`);
  let library = libraries.get(declaration.library);
  if (!library) {
    library = koffi.load(declaration.library + '.dll');
    libraries.set(declaration.library, library);
  }
  binding = library.func(declaration.prototype);
  functions.set(name, binding);
  return binding;
}

/**
 * Call a COM method by its vtable slot, counting IUnknown's three methods.
 * @param {unknown} instance
 * @param {number} index
 * @param {import('koffi').TypeObject} signature
 * @param {...unknown} args
 */
function comCall(instance, index, signature, ...args) {
  const { koffi, pointerSize } = load();
  const vtable = koffi.decode(instance, 'void *');
  return koffi.call(koffi.decode(vtable, index * pointerSize, 'void *'), signature, instance, ...args);
}

/**
 * Open a process for limited queries and close the handle afterwards.
 * @template T
 * @param {number} pid
 * @param {(handle: unknown) => T} operation
 * @returns {T | null} null when Windows refuses the handle
 */
function withQueryableProcess(pid, operation) {
  const handle = fn('OpenProcess')(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!handle) return null;
  try {
    return operation(handle);
  } finally {
    fn('CloseHandle')(handle);
  }
}

/**
 * Read a process executable path, or an empty string when Windows does not reveal it.
 * @param {number} pid
 * @returns {string}
 */
function readProcessPath(pid) {
  return withQueryableProcess(pid, (handle) => {
    const length = [1024];
    const buffer = Buffer.alloc(length[0] * 2);
    if (!fn('QueryFullProcessImageNameW')(handle, 0, buffer, length)) return '';
    return buffer.toString('utf16le', 0, length[0] * 2);
  }) ?? '';
}

module.exports = {
  PROCESS_QUERY_LIMITED_INFORMATION,
  loadWin32: load,
  fn,
  comCall,
  withQueryableProcess,
  readProcessPath,
};
