// xdelta3 WebAssembly Web Worker
let wasmModule = null;

self.onmessage = async (e) => {
  const { action, id, targetBuffer, deltaBuffer, wasmJsUrl } = e.data;

  if (action === 'init') {
    try {
      if (typeof importScripts === 'function' && wasmJsUrl) {
        importScripts(wasmJsUrl);
      }
      
      if (typeof createXdeltaModule === 'function') {
        wasmModule = await createXdeltaModule();
      } else if (typeof self.createXdeltaModule === 'function') {
        wasmModule = await self.createXdeltaModule();
      }

      if (!wasmModule) {
        throw new Error('createXdeltaModule function not found');
      }

      self.postMessage({ id, status: 'initialized' });
    } catch (err) {
      self.postMessage({ id, status: 'error', message: 'WASM init failed: ' + err.message });
    }
    return;
  }

  if (action === 'patch') {
    try {
      if (!wasmModule) {
        throw new Error('WASM module not initialized');
      }

      const targetBytes = new Uint8Array(targetBuffer);
      const deltaBytes = new Uint8Array(deltaBuffer);

      const targetSize = targetBytes.byteLength;
      const deltaSize = deltaBytes.byteLength;

      // Estimate max output size: target size + delta size * 4 + 32MB safety margin
      const maxOutputSize = Math.max(targetSize + deltaSize * 4 + 32 * 1024 * 1024, 64 * 1024 * 1024);

      const targetPtr = wasmModule._malloc(targetSize);
      const deltaPtr = wasmModule._malloc(deltaSize);
      const outputPtr = wasmModule._malloc(maxOutputSize);
      const outputSizePtr = wasmModule._malloc(8);

      if (!targetPtr || !deltaPtr || !outputPtr || !outputSizePtr) {
        throw new Error('WASM memory allocation failed');
      }

      // Copy input data into WASM heap
      wasmModule.HEAPU8.set(targetBytes, targetPtr);
      wasmModule.HEAPU8.set(deltaBytes, deltaPtr);

      // Call xd3_decode_memory safely (with BigInt fallback for 64-bit WASM signatures)
      let res;
      try {
        res = wasmModule._xd3_decode_memory(
          deltaPtr, deltaSize,
          targetPtr, targetSize,
          outputPtr, outputSizePtr,
          maxOutputSize, 0
        );
      } catch (callErr) {
        if (callErr instanceof TypeError && callErr.message.includes('BigInt')) {
          res = wasmModule._xd3_decode_memory(
            BigInt(deltaPtr), BigInt(deltaSize),
            BigInt(targetPtr), BigInt(targetSize),
            BigInt(outputPtr), BigInt(outputSizePtr),
            BigInt(maxOutputSize), 0
          );
        } else {
          throw callErr;
        }
      }

      if (res !== 0) {
        wasmModule._free(targetPtr);
        wasmModule._free(deltaPtr);
        wasmModule._free(outputPtr);
        wasmModule._free(outputSizePtr);
        throw new Error(`xdelta3 디코딩 실패 (코드: ${res}). 원본 파일 버전이 맞지 않거나 이미 패치된 파일일 수 있습니다.`);
      }

      // Get actual output size
      let outputSize = wasmModule.getValue(outputSizePtr, 'i32');
      if (outputSize <= 0) {
        try {
          const bigSize = wasmModule.getValue(outputSizePtr, 'i64');
          outputSize = Number(bigSize);
        } catch {}
      }

      if (outputSize <= 0 || outputSize > maxOutputSize) {
        wasmModule._free(targetPtr);
        wasmModule._free(deltaPtr);
        wasmModule._free(outputPtr);
        wasmModule._free(outputSizePtr);
        throw new Error(`유효하지 않은 패치 결과 크기 (${outputSize} bytes)`);
      }

      // Copy result out of WASM heap
      const outputBuffer = new Uint8Array(wasmModule.HEAPU8.buffer, outputPtr, outputSize).slice().buffer;

      // Clean up WASM heap
      wasmModule._free(targetPtr);
      wasmModule._free(deltaPtr);
      wasmModule._free(outputPtr);
      wasmModule._free(outputSizePtr);

      // Return result with Transferable ArrayBuffer
      self.postMessage({ id, status: 'success', outputBuffer }, [outputBuffer]);
    } catch (err) {
      self.postMessage({ id, status: 'error', message: err.message });
    }
  }
};
