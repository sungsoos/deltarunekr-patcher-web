// 델타룬 한국어 패처 (웹)

// 변수 선언
let selectedDirHandle = null;
let selectedZipFile = null;
let zipInstance = null;
let currentMode = 'folder';
let patchingInProgress = false;
let worker = null;
let workerReady = false;
let messageIdCounter = 0;
const workerPromises = new Map();

// UI 요소
const btnSelectFolder = document.getElementById('btnSelectFolder');
const btnSelectZip = document.getElementById('btnSelectZip');
const zipFileInput = document.getElementById('zipFileInput');
const tabFolderMode = document.getElementById('tabFolderMode');
const tabZipMode = document.getElementById('tabZipMode');
const btnStartPatch = document.getElementById('btnStartPatch');
const btnLaunchGame = document.getElementById('btnLaunchGame');
const statusMessage = document.getElementById('statusMessage');
const progressBarFill = document.getElementById('progressBarFill');
const logConsole = document.getElementById('logConsole');
const btnCopyLog = document.getElementById('btnCopyLog');
const platformSelect = document.getElementById('platformSelect');
const logDetails = document.getElementById('logDetails');
const macWarningBanner = document.getElementById('macWarningBanner');
const noticeText = document.getElementById('noticeText');

// 웹 앱 초기화
window.addEventListener('DOMContentLoaded', () => {
  // 유저 에이전트로 플랫폼 감지 (macOS 또는 Windows/Linux)
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('mac')) {
    platformSelect.value = 'mac';
  } else {
    platformSelect.value = 'windows';
  }

  checkPlatformSupport();

  if (!('showDirectoryPicker' in window)) {
    setMode('zip');
    setStatus('이 브라우저는 폴더 선택을 지원하지 않아 ZIP 패치 모드로 전환되었습니다.', '#ffff00');
  }

  // ✨✨웹어셈블리✨✨ 워커 초기화
  initWorker();

  // 리스너(들) 등록
  tabFolderMode?.addEventListener('click', () => setMode('folder'));
  tabZipMode?.addEventListener('click', () => setMode('zip'));
  btnSelectFolder.addEventListener('click', selectFolder);
  btnSelectZip?.addEventListener('click', () => zipFileInput?.click());
  zipFileInput?.addEventListener('change', handleZipFileSelect);

  btnStartPatch.addEventListener('click', startPatching);
  platformSelect.addEventListener('change', checkPlatformSupport);
  btnCopyLog?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    copyLog();
  });
});

// 모드 변경하는 그거
function setMode(mode) {
  if (patchingInProgress) return; // 패치중에는 모드 변경 금지

  currentMode = mode;
  selectedDirHandle = null;
  selectedZipFile = null;
  zipInstance = null;
  btnStartPatch.disabled = true;
  if (btnLaunchGame) btnLaunchGame.style.display = 'none';

  if (mode === 'folder') {
    tabFolderMode?.classList.add('active');
    tabZipMode?.classList.remove('active');
    btnSelectFolder.style.display = 'inline-flex';
    if (btnSelectZip) btnSelectZip.style.display = 'none';
    setStatus('델타룬이 설치된 폴더를 선택해주세요.', '#ffffff');
    if (noticeText) noticeText.textContent = 'Chrome / Edge / Opera 브라우저 필수';
  } else {
    tabFolderMode?.classList.remove('active');
    tabZipMode?.classList.add('active');
    btnSelectFolder.style.display = 'none';
    if (btnSelectZip) btnSelectZip.style.display = 'inline-flex';
    setStatus('델타룬이 포함된 .zip 압축 파일을 선택해주세요.', '#ffffff');
    if (noticeText) noticeText.textContent = '대부분의 브라우저에서 호환됩니다';
  }
}

// 모드 탭 활성화/비활성화
function toggleModeTabs(enabled) {
  if (tabFolderMode) tabFolderMode.disabled = !enabled;
  if (tabZipMode) tabZipMode.disabled = !enabled;
}

// os 확인 & 비활성화
function checkPlatformSupport() {
  const isMac = platformSelect.value === 'mac';

  if (isMac) {
    if (macWarningBanner) macWarningBanner.style.display = 'block';
    btnStartPatch.disabled = true;
  } else {
    if (macWarningBanner) macWarningBanner.style.display = 'none';
    if (selectedDirHandle || zipInstance) {
      setStatus('패치 준비 완료! [* 패치 적용] 버튼을 누르세요.', '#00ff00');
      btnStartPatch.disabled = false;
    } else btnStartPatch.disabled = true;
  }
}

// 상태 메시지
function setStatus(msg, color = '#ffff00') {
  if (statusMessage) {
    statusMessage.textContent = msg;
    statusMessage.style.color = color;
  }
}

// 로그 추가
function addLog(msg, color = '#FFFFFF') {
  const isFirstLog = logConsole.children.length === 0;
  if (isFirstLog && logDetails) {
    logDetails.style.display = 'block';
    logDetails.open = true;
  }
  const isAtBottom = logConsole.scrollHeight - logConsole.scrollTop - logConsole.clientHeight <= 10;

  const line = document.createElement('div');
  line.className = 'log-line';
  line.style.color = color;
  line.textContent = msg;
  logConsole.appendChild(line);

  if (isAtBottom) {
    logConsole.scrollTop = logConsole.scrollHeight;
  }
}

// 로그 복사
async function copyLog() {
  const text = Array.from(logConsole.children).map(el => el.textContent).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    setStatus('로그가 클립보드에 복사되었습니다.', '#00ff00');
    addLog('* 로그가 클립보드에 복사되었습니다.', '#00ff00');
  } catch (err) {
    setStatus('로그 복사 실패: ' + err.message, '#ff5555');
    addLog('* 로그 복사 실패: ' + err.message, '#ff5555');
  }
}

// ✨✨웹어셈블리✨✨ 워커 초기화
function initWorker() {
  try {
    worker = new Worker('/xdelta3-worker.js');
    worker.onmessage = (e) => {
      const { id, status, outputBuffer, message } = e.data;
      if (id === 'init') {
        if (status === 'initialized') {
          workerReady = true;
        } else {
          console.warn('웹어셈블리 초기화 경고:', message);
          addLog('* WASM 경고: ' + message, '#ffff00');
        }
        return;
      }
      if (workerPromises.has(id)) {
        const { resolve, reject } = workerPromises.get(id);
        workerPromises.delete(id);
        if (status === 'success') {
          resolve(outputBuffer);
        } else {
          reject(new Error(message || 'xdelta3 디코딩 실패'));
        }
      }
    };
    worker.postMessage({ action: 'init', id: 'init', wasmJsUrl: '/xdelta3.js' });
  } catch (err) {
    console.error('Worker 초기화 오류:', err);
    addLog('* Worker 생성 실패: ' + err.message, '#ff5555');
  }
}

function runWasmPatch(targetBuffer, deltaBuffer) {
  return new Promise((resolve, reject) => {
    const id = ++messageIdCounter;
    workerPromises.set(id, { resolve, reject });
    worker.postMessage({
      action: 'patch',
      id,
      targetBuffer,
      deltaBuffer
    }, [targetBuffer, deltaBuffer]);
  });
}

// 폴더 선택 & 검증
async function selectFolder() {
  if (platformSelect.value === 'mac') {
    setStatus('macOS는 현재 지원되지 않습니다.', '#ff5555');
    return;
  }

  if (!('showDirectoryPicker' in window)) {
    setStatus('폴더 선택 브라우저입니다. ZIP 모드로 전환합니다.', '#ffff00');
    setMode('zip');
    return;
  }

  try {
    if (btnLaunchGame) btnLaunchGame.style.display = 'none';
    selectedDirHandle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });
    
    const validation = await validateDeltaruneFolder(selectedDirHandle);

    if (validation.isValid) {
      setStatus('패치 준비 완료! [* 패치 적용] 버튼을 누르세요.', '#00ff00');
      addLog(`* 선택된 폴더: ${selectedDirHandle.name} (게임 감지 성공)`, '#00ff00');
      btnStartPatch.disabled = false;
    } else {
      setStatus('유효한 델타룬 설치 폴더가 아닙니다.', '#ff5555');
      addLog(`* 선택 오류: ${validation.errorMsg}`, '#ff5555');
      btnStartPatch.disabled = true;
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      setStatus('폴더 선택 오류: ' + err.message, '#ff5555');
      addLog(`* 폴더 선택 오류: ${err.message}`, '#ff5555');
    }
  }
}

// .zip 파일 선택 & 검증
async function handleZipFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (platformSelect.value === 'mac') {
    setStatus('macOS는 현재 지원되지 않습니다.', '#ff5555');
    return;
  }

  selectedZipFile = file;
  setStatus('파일 읽는 중...', '#ffff00');

  try {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');
    }

    zipInstance = await JSZip.loadAsync(file);
    const validation = validateZipStructure(zipInstance);

    if (validation.isValid) {
      setStatus('패치 준비 완료!', '#00ff00');
      addLog(`* 선택된 파일: ${file.name} (게임 감지 성공)`, '#00ff00');
      btnStartPatch.disabled = false;
    } else {
      setStatus('유효한 델타룬 .zip 압축 파일이 아닙니다.', '#ff5555');
      addLog(`* 파일 선택 오류: ${validation.errorMsg}`, '#ff5555');
      btnStartPatch.disabled = true;
      zipInstance = null;
    }
  } catch (err) {
    setStatus('파일 읽기 실패: ' + err.message, '#ff5555');
    addLog(`* 파일 로드 실패: ${err.message}`, '#ff5555');
    btnStartPatch.disabled = true;
    zipInstance = null;
  }
}

// 압축 파일 구조 검증
function validateZipStructure(zip) {
  const files = Object.keys(zip.files);

  let launcherPath = null;
  for (const path of files) {
    if (path.endsWith('data.win') || path.endsWith('game.ios')) {
      if (!path.includes('chapter')) {
        launcherPath = path;
        break;
      }
    }
  }

  if (!launcherPath) {
    return { isValid: false, errorMsg: '파일 내에서 data.win을 찾을 수 없습니다.' };
  }

  const chapterPaths = [];
  for (let i = 1; i <= 5; i++) {
    let chPath = null;
    for (const path of files) {
      if (path.includes(`chapter${i}`) && (path.endsWith('data.win') || path.endsWith('game.ios'))) {
        chPath = path;
        break;
      }
    }
    if (!chPath) {
      return { isValid: false, errorMsg: `파일 내에서 챕터 ${i} 데이터 파일(chapter${i}/data.win)을 찾을 수 없습니다.` };
    }
    chapterPaths.push({ chapter: i, path: chPath });
  }

  return { isValid: true, launcherPath, chapterPaths };
}

// 파일 핸들 가져오기
async function getFileHandle(rootDirHandle, relativePathParts) {
  let curr = rootDirHandle;
  for (let i = 0; i < relativePathParts.length - 1; i++) {
    try {
      curr = await curr.getDirectoryHandle(relativePathParts[i]);
    } catch {
      return null;
    }
  }
  try {
    return await curr.getFileHandle(relativePathParts[relativePathParts.length - 1]);
  } catch {
    return null;
  }
}

// 폴더 생성
async function ensureDir(rootDirHandle, relativePathParts) {
  let curr = rootDirHandle;
  for (const part of relativePathParts) {
    curr = await curr.getDirectoryHandle(part, { create: true });
  }
  return curr;
}

// 델타룬 설치 폴더 검증
async function validateDeltaruneFolder(dirHandle) {
  const launcherCandidates = [
    ['data.win'],
    ['game.ios']
  ];

  let launcherHandle = null;
  for (const candidate of launcherCandidates) {
    const handle = await getFileHandle(dirHandle, candidate);
    if (handle) {
      launcherHandle = handle;
      break;
    }
  }

  if (!launcherHandle) {
    return { isValid: false, errorMsg: 'data.win을 찾을 수 없습니다.' };
  }

  const chapterHandles = [];
  for (let i = 1; i <= 5; i++) {
    const folderCandidates = [`chapter${i}_windows`, `chapter${i}`];

    let chHandle = null;
    for (const folderName of folderCandidates) {
      for (const tfName of ['data.win', 'game.ios']) {
        const handle = await getFileHandle(dirHandle, [folderName, tfName]);
        if (handle) {
          chHandle = handle;
          break;
        }
      }
      if (chHandle) break;
    }

    if (!chHandle) {
      return { isValid: false, errorMsg: `챕터 ${i} 데이터 파일(chapter${i}/data.win)이 존재하지 않습니다.` };
    }
    chapterHandles.push({ chapter: i, handle: chHandle });
  }

  return { isValid: true, launcherHandle, chapterHandles };
}

// 패치 함수
async function startPatching() {
  if (platformSelect.value === 'mac') {
    setStatus('macOS는 현재 지원되지 않습니다.', '#ff5555');
    return;
  }
  if (patchingInProgress) return;

  if (currentMode === 'folder') {
    if (!selectedDirHandle) return;
    await startFolderPatching();
  } else {
    if (!zipInstance) return;
    await startZipPatching();
  }
}

// 폴더 패치를 위한 함수
async function startFolderPatching() {
  patchingInProgress = true;
  toggleModeTabs(false);
  btnStartPatch.disabled = true;
  btnSelectFolder.disabled = true;

  if (logDetails) {
    logDetails.style.display = 'block';
    logDetails.open = true;
  }

  setStatus('패치 작업 진행 중...', '#ffff00');
  addLog('--- 폴더 패치 시작 ---', '#ffff00');

  try {
    const validation = await validateDeltaruneFolder(selectedDirHandle);
    if (!validation.isValid) {
      throw new Error(validation.errorMsg);
    }

    // 런처
    setStatus('런처 패치중...', '#ffff00');
    addLog('--- 런처 패치 ---', '#ffff00');
    const launcherPatchUrl = '/patch/xdelta/launcher.xdelta';
    await patchSingleFile(validation.launcherHandle, launcherPatchUrl, '런처');

    // 챕터 1-5 패치
    for (let i = 0; i < validation.chapterHandles.length; i++) {
      const { chapter, handle } = validation.chapterHandles[i];
      setStatus(`챕터 ${chapter}/5 패치 중...`, '#ffff00');
      addLog(`--- 챕터 ${chapter} 패치 ---`, '#ffff00');
      const patchUrl = `/patch/xdelta/ch${chapter}.xdelta`;
      await patchSingleFile(handle, patchUrl, `챕터 ${chapter}`);
    }

    // 언어 파일
    setStatus('언어 파일 복사 중...', '#ffff00');
    addLog('--- 언어 파일 복사 중 ---', '#ffff00');
    await copyLanguageFiles(selectedDirHandle);

    setStatus('한글 패치가 성공적으로 완료되었습니다.', '#00ff00');
    addLog('--- 패치가 성공적으로 완료되었습니다! ---', '#00ff00');
    addLog('* 한글 패치가 성공적으로 완료되었습니다!', '#00ff00');
    if (btnLaunchGame) btnLaunchGame.style.display = 'inline-flex';
  } catch (err) {
    setStatus('오류 발생: ' + err.message, '#ff5555');
    addLog(`* 오류 발생: ${err.message}`, '#ff5555');
  } finally {
    patchingInProgress = false;
    toggleModeTabs(true);
    btnStartPatch.disabled = false;
    btnSelectFolder.disabled = false;
  }
}

// 압축 파일 패치를 위한 함수
async function startZipPatching() {
  patchingInProgress = true;
  toggleModeTabs(false);
  btnStartPatch.disabled = true;
  if (btnSelectZip) btnSelectZip.disabled = true;

  if (logDetails) {
    logDetails.style.display = 'block';
    logDetails.open = true;
  }

  setStatus('파일 패치중...', '#ffff00');
  addLog('--- 압축 파일 패치 시작 ---', '#ffff00');

  try {
    const validation = validateZipStructure(zipInstance);
    if (!validation.isValid) {
      throw new Error(validation.errorMsg);
    }

    // 런처
    setStatus('런처 데이터 패치 중...', '#ffff00');
    addLog('--- 런처 패치 ---', '#ffff00');
    const launcherEntry = zipInstance.file(validation.launcherPath);
    const launcherBuf = await launcherEntry.async('arraybuffer');
    const launcherPatchResp = await fetch('/patch/xdelta/launcher.xdelta');
    const launcherDeltaBuf = await launcherPatchResp.arrayBuffer();

    const patchedLauncherBuf = await runWasmPatch(launcherBuf, launcherDeltaBuf);
    zipInstance.file(validation.launcherPath, patchedLauncherBuf);
    addLog(`* 런처 패치 완료! (${(patchedLauncherBuf.byteLength / 1024 / 1024).toFixed(2)} MB)`, '#00ff00');

    // 챕터 1-5
    for (const { chapter, path } of validation.chapterPaths) {
      setStatus(`챕터 ${chapter}/5 패치 중...`, '#ffff00');
      addLog(`--- 챕터 ${chapter} 패치 ---`, '#ffff00');
      const chEntry = zipInstance.file(path);
      const chBuf = await chEntry.async('arraybuffer');
      const chPatchResp = await fetch(`/patch/xdelta/ch${chapter}.xdelta`);
      const chDeltaBuf = await chPatchResp.arrayBuffer();

      const patchedChBuf = await runWasmPatch(chBuf, chDeltaBuf);
      zipInstance.file(path, patchedChBuf);
      addLog(`* 챕터 ${chapter} 패치 완료! (${(patchedChBuf.byteLength / 1024 / 1024).toFixed(2)} MB)`, '#00ff00');
    }

    // 언어 파일
    setStatus('한글 언어 파일 복사 중...', '#ffff00');
    addLog('--- 언어 파일 복사 ---', '#ffff00');
    
    const samplePath = validation.launcherPath;
    const basePrefix = samplePath.includes('/') ? samplePath.substring(0, samplePath.lastIndexOf('/') + 1) : '';

    const langSubdirs = ['chapter1_windows', 'chapter2_windows', 'chapter3_windows', 'chapter4_windows', 'chapter5_windows'];
    for (const langDirName of langSubdirs) {
      try {
        const resp = await fetch(`/api/lang-files?dir=${langDirName}`);
        if (resp.ok) {
          const fileList = await resp.json();
          const folderFiles = fileList.filter(f => f.startsWith(langDirName));
          let copiedCount = 0;

          for (const filePath of folderFiles) {
            const fileResp = await fetch(`/patch/lang/${filePath}`);
            if (fileResp.ok) {
              const blob = await fileResp.blob();
              zipInstance.file(basePrefix + filePath, blob);
              copiedCount++;
            }
          }
          if (copiedCount > 0) {
            addLog(`  * 복사 완료: ${langDirName} (${copiedCount}개 파일)`, '#88ff88');
          }
        }
      } catch (e) {
        console.warn('압축 파일 언어 복사 경고:', e);
      }
    }

    // 압축 파일 재생성 및 다운로드
    setStatus('패치된 압축 파일 생성 중... (오래 걸릴 수 있음)', '#ffff00');
    addLog('--- 패치된 압축 파일 생성 및 재압축 중 ---', '#ffff00');

    let finalZip = zipInstance;
    if (!basePrefix) {
      finalZip = new JSZip();
      const folder = finalZip.folder('DELTARUNE');
      for (const [filename, fileObj] of Object.entries(zipInstance.files)) {
        if (!fileObj.dir) {
          const content = await fileObj.async('arraybuffer');
          folder.file(filename, content);
        }
      }
    }

    const patchedZipBlob = await finalZip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const downloadUrl = URL.createObjectURL(patchedZipBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'DELTARUNE_PATCHED.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    setStatus('한글 패치가 성공적으로 완료되었습니다!', '#00ff00');
    addLog('--- 패치된 압축 파일 다운로드 성공! ---', '#00ff00');
    addLog('* 한글 패치가 성공적으로 완료되었습니다! (DELTARUNE_PATCHED.zip 다운로드됨)', '#00ff00');
  } catch (err) {
    setStatus('패치 오류: ' + err.message, '#ff5555');
    addLog(`* 오류 발생: ${err.message}`, '#ff5555');
  } finally {
    patchingInProgress = false;
    toggleModeTabs(true);
    btnStartPatch.disabled = false;
    if (btnSelectZip) btnSelectZip.disabled = false;
  }
}

// 파일을 패치하는 함수
async function patchSingleFile(fileHandle, deltaUrl, label) {
  const patchResp = await fetch(deltaUrl);
  if (!patchResp.ok) {
    throw new Error(`${label} 패치 파일(${deltaUrl})을 서버에서 읽을 수 없습니다.`);
  }
  return patchSingleFileWithResp(fileHandle, patchResp, label);
}

async function patchSingleFileWithResp(fileHandle, response, label) {
  const deltaArrayBuffer = await response.arrayBuffer();
  if (deltaArrayBuffer.byteLength === 0) {
    throw new Error(`${label} 델타 패치 파일이 비어 있습니다.`);
  }

  const targetFile = await fileHandle.getFile();
  if (targetFile.size === 0) {
    throw new Error(`${label} 원본 대상 파일이 비어 있습니다.`);
  }
  const targetArrayBuffer = await targetFile.arrayBuffer();

  const patchedBuffer = await runWasmPatch(targetArrayBuffer, deltaArrayBuffer);

  const writable = await fileHandle.createWritable();
  await writable.write(patchedBuffer);
  await writable.close();

  addLog(`* ${label} 패치 완료! (${(patchedBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`, '#00ff00');
}

// 언어 파일 복사 함수
async function copyLanguageFiles(rootDirHandle) {
  const langSubdirs = ['chapter1_windows', 'chapter2_windows', 'chapter3_windows', 'chapter4_windows', 'chapter5_windows'];
  
  for (const langDirName of langSubdirs) {
    try {
      const resp = await fetch(`/api/lang-files?dir=${langDirName}`);
      if (resp.ok) {
        const fileList = await resp.json();
        const folderFiles = fileList.filter(f => f.startsWith(langDirName));
        let copiedCount = 0;

        for (const filePath of folderFiles) {
          const fileResp = await fetch(`/patch/lang/${filePath}`);
          if (fileResp.ok) {
            const blob = await fileResp.blob();
            const parts = filePath.split('/');
            const targetDir = await ensureDir(rootDirHandle, parts.slice(0, -1));
            const targetFileHandle = await targetDir.getFileHandle(parts[parts.length - 1], { create: true });
            const writable = await targetFileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            copiedCount++;
          }
        }
        if (copiedCount > 0) {
          addLog(`  * 복사 완료: ${langDirName} (${copiedCount}개 파일)`, '#88ff88');
        }
      }
    } catch (e) {
      console.warn('언어 파일 복사 경고:', e);
    }
  }
}
