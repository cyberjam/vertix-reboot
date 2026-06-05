# PROJECT_STATE.md

> Vertix.io Reboot — 현재 상태 스냅샷. **새 세션에서 이 문서만 읽고 바로 이어서 개발**할 수 있도록 작성.
> 최종 갱신 기준 커밋: `15870556` (PR #15). 설계 문서: [`docs/design/`](./docs/design/README.md).

---

## 1. 프로젝트 개요

원본 **Vertix.io**(2016, 탑다운 3/4 시점 아레나 슈터)를 현대 웹 기술로 재구현하는 프로젝트.
원본 복원이 아니라 **게임성만 계승**한 리부트.

**방향(불변 원칙):**
- 즉시 플레이 · 로그인 없음 · 빠른 매칭 · 클래스 기반 FPS · 웹 브라우저 실행
- **서버 권위(authoritative server)** · **Top-down TPS 유지**(Krunker식 1인칭 금지)
- 계정/클랜/상점/모드 시스템은 구현하지 않음

**현재 도달 지점:** 플레이 가능한 **FFA 알파**. 3클래스/4무기, 벽·엄폐·LOS, 헬스팩, 점수판,
서버 권위 + 클라 예측/재조정, 게임필 이펙트까지 동작. (단, **인게임 진입 메뉴/서버 브라우저 UI는 아직 없음** — `/play`가 즉시 자동 입장.)

---

## 2. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 모노레포 | **pnpm workspaces + Turborepo** | Node ≥ 20, pnpm 10 |
| 클라이언트 셸/페이지 | **Next.js 15 (App Router) + React 19 + TypeScript** | `apps/web` |
| 렌더링/입력 | **Phaser 3** | 클라 전용(`ssr:false` 동적 import) |
| 실시간 멀티플레이 | **Colyseus 0.16** (`@colyseus/core` + `@colyseus/ws-transport` + `@colyseus/schema` 3.x) | `apps/game-server`, 서버 실행은 `tsx` |
| 클라 네트워크 | **colyseus.js 0.16** | |
| 공유 코드 | **`@vertix/shared`** (TS 소스 직접 공유) | 클라·서버 단일 진실 공급원 |
| (설계상 예정) | Supabase | **아직 미사용** — 계정/영속은 미구현 |

---

## 3. 폴더 구조

```
vertix-reboot/
├─ PROJECT_STATE.md            # (이 문서)
├─ README.md                   # 실행/구조 요약
├─ package.json                # 루트 스크립트(turbo)
├─ pnpm-workspace.yaml · turbo.json · tsconfig.base.json
├─ docs/design/                # 설계 문서 01~06 (README.md 인덱스)
│   ├─ 01-game-analysis · 02-mvp-scope · 03-technical-design
│   ├─ 04-milestones · 05-weapon-balance · 06-ui-ux-plan
├─ packages/shared/src/        # ⭐ 클라·서버 공유 (단일 진실 공급원)
│   ├─ index.ts                # 재exports + SHARED_VERSION, NET(TICKRATE/PATCHRATE)
│   ├─ gameplay.ts             # WORLD, PLAYER, RESPAWN_MS, HEALTH_PACK, FFA, WEAPONS, CLASSES
│   ├─ protocol.ts             # 네트워크 메시지 타입(계약)
│   ├─ math.ts                 # clamp, rayCircleDistance, rayAabbDistance
│   ├─ sim.ts                  # stepMovement (결정론적 이동+벽충돌; 서버/클라 공용)
│   └─ maps.ts                 # MapDef 타입 + ARENA01 + getMap
├─ apps/game-server/src/       # Colyseus 권위 서버
│   ├─ index.ts                # 부트스트랩 (ws://:2567)
│   ├─ schema/GameState.ts     # Player / MatchState / HealthPack / GameState
│   └─ rooms/ArenaRoom.ts      # 권위 시뮬·FFA 루프·발사·충돌·헬스팩
└─ apps/web/                   # Next.js + Phaser 클라이언트
    ├─ app/layout.tsx · app/page.tsx(랜딩) · app/play/page.tsx(게임)
    └─ game/PhaserGame.tsx · game/scenes/ArenaScene.ts  # 접속+렌더+입력+HUD 전부
```

---

## 4. 현재 구현 완료 기능 (PR #1~#15)

- **모노레포/스캐폴딩** — Next.js + Phaser + Colyseus + shared, 빌드/타입체크 통과.
- **이동/카메라** — WASD 이동, 탑뷰 추적 카메라, 마우스 조준(캐릭터 회전 + 조준선/레티클).
- **서버 권위 전투** — 히트스캔, 데미지, 사망, 2초 후 안전 스폰 리스폰, 킬/데스 집계.
- **클라 예측 + 재조정** — 입력 시퀀스(seq/dtMs), `stepMovement` 공용, `lastSeq` 기반 미확인 입력 재생(드리프트 없음). *검증: 서버 위치 == 클라 예측 dx<0.001px.*
- **클래스 3종 / 무기 4종 (데이터 주도)**
  - Triggerman(100HP, 머신건) · Hunter(50HP, 스나이퍼+머신피스톨) · Vince(100HP, 샷건 4펠릿)
  - 자동/반자동(클릭당 1발) 발사, 무기별 탄창/재장전, 무기 전환(Q), **클래스 선택은 리스폰 시 적용**(키 1/2/3).
- **벽·충돌·엄폐·LOS** — `MapDef` 데이터 벽(AABB), 원-AABB 슬라이딩 충돌(통과 불가), 총알이 벽에서 제거, 벽 뒤 적 비피격(시야 차단). 서버 권위, 클라 예측 일치.
- **Arena01 맵** — 2000×2000, 8스폰/5헬스팩/중앙 교전구역/측면 루트/엄폐 블록(미로 아님·개방 아님).
- **헬스팩** — 맵 위치, 손상 시 접촉 +50 회복(풀피 불가), 소비 후 쿨다운 재생성(기본 15s).
- **FFA 모드 + 라운드 루프** — 킬당 100점, **1500점 또는 4분** 종료 → 결과(승자) → 자동 리셋. `score==kills*100` 불변식.
- **HUD/피드백** — 체력바·이름 라벨, 점수판(정렬·본인 강조), 킬피드, 타이머/목표, 트레이서, 머즐 플래시, 히트마커+셰이크(내 명중), 사망 버스트, 피격 적색 플래시, 사망 카메라 셰이크.
- **무기 밸런스 캘리브레이션** — [05 문서](./docs/design/05-weapon-balance.md): TTK 모델·사거리/연사 티어·5 불변식.

> 각 기능은 머지 전 **2-클라이언트 통합 스모크 테스트**로 검증함(임시 테스트 파일은 미커밋).

---

## 5. 미구현 기능

- **인게임 진입 UI** — 메인 메뉴/닉네임 입력/PLAY 버튼/클래스 선택 화면/서버 브라우저 **없음**. 현재 `/play`가 즉시 자동 입장하고 닉네임은 `Guest####` 자동 생성. → 설계: [06-ui-ux-plan](./docs/design/06-ui-ux-plan.md) (U1~U7).
- **사망/라운드 종료 DOM 오버레이** — 현재 Phaser 텍스트/배너만.
- **설정/조작법 화면**, **키 리매핑**, **미니맵**, **PING/FPS 표시**, **채팅**, **킬스트릭 텍스트**.
- **배포** — Vercel(web) + 상태유지 호스트(game-server). 설정/Dockerfile **미작성**(이전 시도 revert됨). 서버 헬스체크/프로덕션 CORS도 미적용.
- **추가 클래스/무기**(Detective 등), **추가 모드**(TDM/Hardpoint 등) — 단일 FFA만.
- **계정·클랜·상점·모드 시스템·영속 통계** — **의도적으로 범위 외(구현 안 함)**.
- **자동화 테스트 러너** — 정식 단위/통합 테스트 스위트 없음(검증은 임시 tsx 스모크로 수행).
- **사운드 SFX** 없음.

---

## 6. 서버 구조 (`apps/game-server`)

- **부트스트랩** `src/index.ts`: `new Server({ transport: new WebSocketTransport({ server: createServer() }) })`, `define("arena", ArenaRoom)`, `listen(PORT ?? 2567)`.
- **스키마** `src/schema/GameState.ts`:
  - `Player`: `name, classId, weaponId, x, y, angle, hp, maxHp, ammo, reloading, alive, kills, deaths, score, lastSeq`
  - `MatchState`: `mode("ffa"), phase("playing"|"ended"), timeRemainingMs, targetScore, winnerId, winnerName`
  - `HealthPack`: `x, y, active`
  - `GameState`: `players: MapSchema<Player>`, `match: MatchState`, `healthPacks: ArraySchema<HealthPack>`
- **룸** `src/rooms/ArenaRoom.ts` (권위 시뮬 핵심):
  - `setSimulationInterval(update, 1000/NET.TICKRATE)` = **30Hz 틱**, `setPatchRate(NET.PATCHRATE_MS=50ms)`.
  - 서버 전용(미복제) 상태: 입력 큐(`queues`), 최신 조준/발사(`latest`), 무기별 런타임(`weapons`: ammo/nextFireAt/reloadEndsAt/reloading), `prevFiring`(반자동 엣지), `respawnAt`, `pendingClass`, 헬스팩 `packRespawnAt`.
  - 매 틱: 입력 큐 소비(커맨드별 `stepMovement`+벽충돌, `lastSeq` 기록, 틱당 ≤10), 조준 갱신, 재장전/발사(자동=홀드, 반자동=엣지), 헬스팩 픽업/재생성, FFA 시간/목표 종료 판정·리셋.
  - **발사** `fireWeapon`→`fireRay`: 펠릿 수만큼 확산 레이, 벽까지 레이 클램프(총알 제거) + 벽 앞 최근접 적만 피격(LOS), 데미지/킬/점수, `shot` 브로드캐스트.
  - **스폰** `pickSpawn`: 살아있는 적과 가장 먼 맵 스폰(스폰킬 방지).
  - **env 오버라이드(튜닝/테스트):** `PORT`, `MAP_ID`, `FFA_TARGET_SCORE`, `FFA_DURATION_MS`, `FFA_END_SCREEN_MS`, `HP_RESPAWN_MS`.

---

## 7. 클라이언트 구조 (`apps/web`)

- **`app/play/page.tsx`**: `PhaserGame`를 `dynamic(... { ssr:false })`로 마운트.
- **`game/PhaserGame.tsx`**: 브라우저에서 Phaser/씬을 지연 로드, arcade physics 활성, `ArenaScene` 실행. 언마운트 시 `game.destroy`.
- **`game/scenes/ArenaScene.ts`** (현재 클라 로직 전부 집중):
  - `connect()`: `new Client(NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567")` → `joinOrCreate("arena", { name, classId })`.
  - `update()`: 트레이서/킬피드 그리기 → `room.state` 폴링 → 뷰 동기화/헬스팩 → 로컬 입력+예측 → 렌더 → 조준선 → HUD.
  - 입력: WASD, 마우스 조준, 좌클릭 발사, R 재장전(메시지), Q 무기전환(메시지), 1/2/3 클래스 선택(메시지). 매 프레임 `room.send("input", {seq,dtMs,moveX,moveY,aim,firing})`.
  - 예측/재조정: 로컬 `predicted`에 미확인 입력(`seq>lastSeq`)을 `stepMovement(...,ARENA01.walls)`로 재생. 원격은 보간.
  - 렌더: 클래스 색 사각형(본인 외곽선), 머즐, 이름 라벨, 벽/헬스팩(상태 기반), 점수판/매치/킬피드/배너 텍스트, 게임필 이펙트.

> **주의:** 현재 클라 로직이 `ArenaScene.ts` 한 파일에 집중되어 있고 **연결도 Phaser가 소유**. UI 개선(메뉴/오버레이) 착수 시 [06-ui-ux-plan](./docs/design/06-ui-ux-plan.md)의 **U1: 연결을 React(NetProvider)로 이전 + ArenaScene을 room 주입형으로 리팩터**부터 진행 권장.

---

## 8. 네트워크 프로토콜 (`packages/shared/src/protocol.ts`)

**상태 동기화:** Colyseus Schema 델타(30Hz 시뮬 / 50ms 패치). 클라는 `room.state`를 읽기.

**Client → Server 메시지:**
| 타입 | 페이로드 | 설명 |
|------|----------|------|
| `input` | `InputMessage { seq, dtMs, moveX(-1..1), moveY(-1..1), aim(rad), firing }` | 매 프레임 의도 전송 |
| `reload` | (없음) | 활성 무기 재장전 요청 |
| `switchWeapon` | (없음) | 주↔보조 전환(보조 있는 클래스) |
| `selectClass` | `SelectClassMessage { classId }` | **다음 리스폰에 적용** |

**입장 옵션:** `JoinOptions { name?, classId? }` (`joinOrCreate("arena", opts)`).

**Server → Client 메시지(이벤트):**
| 타입 | 페이로드 | 용도 |
|------|----------|------|
| `shot` | `ShotMessage { by, sx, sy, ex, ey, hit }` | 트레이서/머즐/히트마커(`by`=슈터 세션id) |
| `kill` | `KillMessage { killerName, victimName }` | 킬피드 |

**핵심 상수(`gameplay.ts`/`index.ts`):** `NET.TICKRATE=30`, `NET.PATCHRATE_MS=50`, `WORLD 2000×2000`,
`PLAYER{RADIUS16,SPEED320,MAX_HP100}`, `RESPAWN_MS2000`, `HEALTH_PACK{HEAL50,RADIUS18,RESPAWN15000}`,
`FFA{KILL_SCORE100,TARGET1500,DURATION240000,END5000}`, `sim.MAX_INPUT_DT_MS=50`.
무기: machinegun(25/24/90/1500/750,auto) · sniper(100/5/1100/2200/1700,semi) · machine_pistol(12/5/60/1000/520,auto) · shotgun(25/6/800/1900/480,semi,4펠릿/16°).

---

## 9. 향후 우선순위 로드맵

**P0 — 즉시 플레이 UX (방향성 핵심)** · 참고: [06-ui-ux-plan](./docs/design/06-ui-ux-plan.md)
1. **U1 연결 리팩터** — Colyseus 연결을 React(NetProvider)로 이전, `ArenaScene`을 room 주입형으로(동작 보존). *모든 UI 작업의 토대.*
2. **U2 메인 메뉴** — 닉네임(localStorage) + 클래스 카드 + PLAY(퀵매치).
3. **U3 서버 브라우저** — 룸 `maxClients`+`setMetadata`, `getAvailableRooms("arena")` 리스트 + 퀵매치.
4. **U4/U5 사망·라운드 종료 DOM 오버레이** — 클래스 스왑/리스폰 카운트, 스코어보드/다음 라운드.

**P1 — 공개 플레이(배포)**
5. game-server 프로덕션화: **헬스체크(/health) + 교차출처 CORS** 확인(Colyseus 매치메이크는 CORS 기본 제공), `Dockerfile`, Fly.io/Render 설정.
6. web 배포(Vercel, Root=`apps/web`) + `NEXT_PUBLIC_GAME_SERVER_URL=wss://...`.

**P2 — 콘텐츠/폴리시**
7. 추가 클래스/무기(예: Detective 데저트이글), 추가 모드(TDM/Hardpoint).
8. 사운드 SFX, 미니맵, 킬스트릭 텍스트, 설정/키 리매핑.
9. 정식 테스트 러너(vitest 등)로 스모크 테스트 영속화.

**범위 외(구현 안 함):** 계정/로그인 · 클랜 · 상점/코스메틱 · 모드(텍스처) 시스템 · 사설 서버.

---

## 부록 — 빠른 시작 / 개발 워크플로우

```bash
corepack enable && pnpm install
pnpm dev:server     # Colyseus  ws://localhost:2567
pnpm dev:web        # Next.js    http://localhost:3000  → /play
# 또는 동시: pnpm dev   |   타입체크: pnpm typecheck   |   빌드: pnpm build
```
- 멀티플레이 확인: 브라우저 탭 2개로 `/play` 접속. 인게임 키: WASD/마우스/클릭/R/Q/1·2·3.
- **검증 패턴(권장):** `apps/web/`에 임시 `smoke-*.mts` 작성 → `apps/game-server` 서버 띄우고 `tsx`로 두 클라이언트 시뮬 → **검증 후 파일 삭제(미커밋)**. 서버 포트 정리는 `fuser -k 2567/tcp` (주의: `pkill -f "src/index.ts"`는 실행 셸 자신과도 매칭되므로 금지).
- **개발 워크플로우(합의됨):** 단계마다 **브랜치 생성 → 작업 → PR 생성 → 자동(squash) 머지 → master 동기화**. 기본 개발 브랜치 접두사 예: `feat/…`, `docs/…`.
