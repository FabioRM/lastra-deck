// @ts-check
'use strict';

let native;

function protection() {
  if (process.platform !== 'win32') throw new Error('Live agent access requires Windows.');
  if (native) return native;
  const koffi = require('koffi');
  const crypt = koffi.load('crypt32.dll');
  const kernel = koffi.load('kernel32.dll');
  const blob = koffi.struct({ cbData: 'uint32_t', pbData: 'uint8_t *' });
  const input = koffi.pointer(blob);
  const signature = [input, 'void *', 'void *', 'void *', 'void *', 'uint32_t', koffi.out(input)];
  const free = kernel.func('void * __stdcall LocalFree(void *)');
  const protect = crypt.func('__stdcall', 'CryptProtectData', 'int32_t', signature);
  const unprotect = crypt.func('__stdcall', 'CryptUnprotectData', 'int32_t', signature);

  function transform(operation, bytes) {
    const result = {};
    const ok = operation({ cbData: bytes.length, pbData: bytes }, null, null, null, null, 1, result);
    if (!ok || !result.pbData) throw new Error('The agent credential is unavailable to this Windows user.');
    try {
      return Buffer.from(koffi.decode(result.pbData, 'uint8_t', result.cbData));
    } finally {
      free(result.pbData);
    }
  }

  native = { protect: (bytes) => transform(protect, bytes), unprotect: (bytes) => transform(unprotect, bytes) };
  return native;
}

module.exports = { protection };
