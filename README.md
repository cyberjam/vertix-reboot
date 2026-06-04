# Vertix Reboot

원본 **Vertix.io**를 현대 웹 기술로 재구현하는 프로젝트. 탑다운 3/4 시점 아레나 슈터.

> 설계 문서는 [`docs/design`](./docs/design/README.md) 참조.
> 본 저장소는 현재 **Milestone 1 (모노레포 스캐폴딩)** 단계이며, 게임 기능은 아직 없습니다.

## 기술 스택

- **Next.js (App Router) + TypeScript** — 클라이언트 셸 / 페이지
- **Phaser 3** — 탑다운 2D 렌더링 (클라이언트 전용)
- **Colyseus** — 권위(authoritative) 멀티플레이 게임 서버
- **pnpm workspaces + Turborepo** — 모노레포

## 디렉터리 구조

```
vertix-reboot/
├─ package.json              # 루트 워크스페이스 + 스크립트
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json        # 공통 TS 설정
├─ apps/
│  ├─ web/                   # Next.js + Phaser 3 (클라이언트)
│  │  ├─ app/
│  │  │  ├─ layout.tsx
│  │  │  ├─ page.tsx         # 랜딩
│  │  │  └─ play/page.tsx    # Phaser 마운트 (ssr:false)
│  │  ├─ game/PhaserGame.tsx # Phaser boot 씬 (게임 로직 없음)
│  │  └─ next.config.mjs
│  └─ game-server/           # Colyseus 권위 서버
│     └─ src/
│        ├─ index.ts         # 서버 부트스트랩
│        └─ rooms/ArenaRoom.ts  # 룸 스켈레톤 (로깅만)
└─ packages/
   └─ shared/                # 클라·서버 공유 타입/상수 (단일 진실 공급원)
      └─ src/index.ts
```

## 설치

[pnpm](https://pnpm.io)이 필요합니다 (Node ≥ 20).

```bash
# pnpm이 없다면 corepack으로 활성화
corepack enable

# 의존성 설치
pnpm install
```

## 초기 실행

### 전체 동시 실행 (Turborepo)

```bash
pnpm dev
```

- 웹 클라이언트: http://localhost:3000 (랜딩 → **Play** → `/play`에서 Phaser boot 화면)
- 게임 서버: `ws://localhost:2567` (콘솔에 `Colyseus listening …` 로그)

### 개별 실행

```bash
pnpm dev:web      # Next.js 클라이언트만 (:3000)
pnpm dev:server   # Colyseus 게임 서버만 (:2567)
```

### 빌드 / 타입체크

```bash
pnpm build        # 전체 빌드 (next build + 서버/공유 typecheck)
pnpm typecheck    # 전체 타입체크
```

## 동작 확인 (Milestone 1 완료 기준)

1. `pnpm install` 성공.
2. `pnpm dev:web` 후 `http://localhost:3000` 랜딩 표시, `/play`에서 "Phaser boot OK" 캔버스 렌더.
3. `pnpm dev:server` 후 콘솔에 `Colyseus listening on ws://localhost:2567` 출력.
4. `@vertix/shared`가 web·game-server 양쪽에서 import되어 빌드 통과.
