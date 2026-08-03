# [DELTARUNE 한글 패처 Web](https://dtkr.sungsoos.kr)
dtkrpatchteam에서 제작한 한국어 패치를 웹에서 사용하게 해주는 패처입니다.

## 메인 미러: [https://git.sungsoos.kr/sungsoos/deltarunekr_patcher_web](https://git.sungsoos.kr/sungsoos/deltarunekr_patcher_web)

## 실행 및 사용 방법
### 1. Bun 웹 서버 실행
```bash
# 서버 시작
bun run server.js

# 또는 핫 리로드 모드
bun --hot server.js
```
서버 실행 후 브라우저에서 `http://localhost:8275`으로 접속합니다.

### 2. 패치 사용 방법
1. 웹 페이지 접속 후 **[DELTARUNE 폴더 선택]** 버튼을 클릭하여 스팀 등 설치 폴더를 선택합니다.
2. 런처 및 챕터 1~5 파일 자동 검증 후 **[한글 패치 적용하기]** 버튼을 클릭합니다.
3. 패치 및 한글 언어 파일 복사 완료 후 게임을 실행합니다.

*(주의: 현재 Windows 환경의 Chrome/Edge 브라우저를 지원하며, macOS 환경은 지원 준비 중입니다.)*

## WebAssembly 재빌드 (필요 시)
Emscripten Docker 환경을 이용하여 `xdelta3.wasm` 및 `xdelta3.js`를 재빌드할 수 있습니다:
```bash
bun run build:wasm
```

## 프로젝트 구조

```text
deltarunekr_patcher_web/
├── public/                   # 정적 파일(들)
│   ├── assets/              # 각종 에셋
│   ├── patch/               # 패치 및 언어 데이터
│   │
│   ├── index.html           # 웹 UI
│   ├── index.css            # 웹 CSS
│   ├── app.js               # 웹 JS
│   │
│   ├── xdelta3-worker.js    # WASM 백그라운드 Web Worker
│   ├── xdelta3.js           # Emscripten WASM 모듈 로더
│   └── xdelta3.wasm         # WebAssembly로 컴파일된 xdelta3 바이너리
│
├── server.js                 # Bun HTTP 서버
├── package.json              # 프로젝트 설정
├── .gitignore                # Git 제외 설정
└── README.md                 # a
```

## 라이선스 및 참고 사항
- 델타돋움체: qhtjr1116 제작, 링크: [https://eocnd1116.github.io/qhtjrFont/index.html?type=1&n=0](https://eocnd1116.github.io/qhtjrFont/index.html?type=1&n=0)
- 한국어 패치: dtkrpatchteam 제작, 링크: [https://www.deltarunekr.kro.kr/](https://www.deltarunekr.kro.kr/)
- GPL-3.0 라이선스