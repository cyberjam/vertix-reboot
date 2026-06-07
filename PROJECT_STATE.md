# PROJECT_STATE.md

> Vertix.io Reboot — 현재 상태 스냅샷. **새 세션에서 이 문서만 읽고 바로 이어서 개발**할 수 있도록 작성.
> 기준 브랜치 `dev` (커밋 `dde94f6`). 배포 설정은 `master`에 있음(§5). 설계 문서: [`docs/design/`](./docs/design/README.md).

---

## 1. 프로젝트 개요

원본 **Vertix.io**(2016, 탑다운 3/4 시점 아레나 슈터)를 현대 웹 기술로 재구현하는 프로젝트.
원본 복원이 아니라 **게임성만 계승**한 리부트.

**방향(불변 원칙):**
- 즉시 플레이 · 로그인 없음 · 빠른 매칭 · 클래스 기반 FPS · 웹 브라우저 실행
- **서버 권위(authoritative server)** · **Top-down TPS 유지**(Krunker식 1인칭 금지)
- 계정/클랜/상점/모드 시스템은 구현하지 않음

**현재 도달 지점:** 플레이 가능한 **FFA 알파 + 즉시 플레이 UX 완성**.
`/`로 접속하면 **풀스크린 메인 메뉴**(닉네임 + 클래스 카드 + ENTER GAME)가 바로 뜨고, 입장하면
서버 권위 전투(3클래스/4무기, 벽·엄폐·LOS, 헬스팩, 점프), React DOM HUD/미니맵/스코어보드,
사망 오버레이(킬러·클래스 스왑·리스폰 카운트), 라운드 종료 오버레이, 서버 브라우저, 설정/조작법까지
동작한다. 배포 설정(Docker/Render/Vercel/health/CORS)은 작성 완료(`master`), **실제 공개 호스팅만 미실시**.

---

## 2. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 모노레포 | **pnpm workspaces + Turborepo** | Node ≥ 20, pnpm 10 |
| 클라이언트 셸/UI | **Next.js 15 (App Router) + React 19 + TypeScript** | `apps/web`. 메뉴·HUD·오버레이는 React DOM |
| 렌더링/입력 | **Phaser 3** | 클라 전용(`ssr:false` 동적 import), 월드/이펙트만 |
| 실시간 멀티플레이 | **Colyseus 0.16** (`@colyseus/core` + `@colyseus/ws-transport` + `@colyseus/schema` 3.x) | `apps/game-server`, 서버 실행은 `tsx` |
| 클라 네트워크 | **colyseus.js 0.16** | 연결은 React `NetProvider`가 소유 |
| 공유 코드 | **`@vertix/shared`** (TS 소스 직접 공유) | 클라·서버 단일 진실 공급원 |
| 배포 | **Docker + Render(서버) / Vercel(web)** | 설정 완료(`master`), 호스팅 미실시 |
| (설계상 예정) | Supabase | **아직 미사용** — 계정/영속은 미구현 |

---

## 3. 폴더 구조

```
vertix-reboot/
├─ PROJECT_STATE.md · ARCHITECTURE.md · TODO.md · README.md
├─ package.json · pnpm-workspace.yaml · turbo.json · tsconfig.base.json
├─ Dockerfile · .dockerignore · render.yaml · .env.example   # 배포(현재 master)
├─ docs/design/ (01~06) · docs/DEPLOY.md (master)
├─ packages/shared/src/        # ⭐ 클라·서버 공유 (단일 진실 공급원)
│   ├─ index.ts                # 재exports + SHARED_VERSION, NET(TICKRATE/PATCHRATE)
│   ├─ gameplay.ts             # WORLD, PLAYER, JUMP, RESPAWN_MS, HEALTH_PACK, FFA, WEAPONS, CLASSES
│   ├─ protocol.ts             # 네트워크 메시지 타입(계약)
│   ├─ math.ts                 # clamp, rayCircleDistance, rayAabbDistance
│   ├─ sim.ts                  # stepMovement(이동+벽충돌) · stepJump(점프 적분) — 서버/클라 공용
│   └─ maps.ts                 # MapDef 타입 + ARENA01 + getMap
├─ apps/game-server/src/       # Colyseus 권위 서버
│   ├─ index.ts                # 부트스트랩 (ws://:2567) — /health + CORS(master)
│   ├─ schema/GameState.ts     # Player / MatchState / HealthPack / GameState
│   └─ rooms/ArenaRoom.ts      # 권위 시뮬·FFA 루프·발사·충돌·점프·헬스팩
└─ apps/web/
    ├─ app/layout.tsx          # 풀스크린(overflow hidden) + viewport 메타
    ├─ app/page.tsx            # ⭐ 진입점: NetProvider → 메뉴/게임 전환
    ├─ app/play/page.tsx       # `/` 재export(라우팅 호환)
    ├─ components/             # MainMenu · ServerBrowser · SettingsModal · Hud · Minimap · DeathOverlay
    ├─ lib/settings.ts         # 설정(셰이크/이펙트/FPS) localStorage
    └─ game/
        ├─ net/NetProvider.tsx # ⭐ Colyseus client/room 소유 (connect/disconnect/getRooms)
        ├─ PhaserGame.tsx      # 풀스크린 Phaser(Scale.RESIZE) + HUD/DeathOverlay 오버레이
        └─ scenes/ArenaScene.ts# room 주입형: 렌더 + 입력 + 예측/재조정 + 인월드 이펙트
```

---

## 4. 현재 구현 완료 기능

**코어 게임플레이**
- **이동/카메라** — WASD, 탑뷰 추적 카메라(점프 시 지면 앵커 추적), 마우스 조준.
- **클라 예측 + 재조정** — seq/dtMs, `stepMovement` 공용, `lastSeq` 기반 미확인 입력 재생(드리프트 없음).
- **서버 권위 전투** — 히트스캔, 데미지, 사망, 2초 후 안전 스폰 리스폰, 킬/데스/점수 집계.
- **클래스 3종 / 무기 4종 (데이터 주도)** — Triggerman(100HP·머신건) · Hunter(50HP·스나이퍼+머신피스톨) · Vince(100HP·샷건 4펠릿). 자동/반자동 발사, 탄창/재장전, 무기 전환(Q).
- **점프(Space)** — 서버 권위 수직 홉(`jumpY` 복제, `stepJump` 공용). **홀드 시 착지 후 자동 재점프**(쿨다운 250ms), x/y·히트판정과 독립.
- **벽·충돌·엄폐·LOS** — AABB 벽, 원-AABB 슬라이딩 충돌, 총알 벽 제거, 벽 뒤 적 비피격.
- **Arena01 맵** — 2000×2000, 8스폰/5헬스팩/중앙 교전구역/측면 루트/엄폐 블록.
- **헬스팩** — 손상 시 접촉 +50(풀피 불가), 소비 후 쿨다운 재생성(기본 15s).
- **FFA 모드 + 라운드 루프** — 킬당 100점, **1500점 또는 4분** 종료 → 결과 → 자동 리셋.

**UX / UI (React DOM)**
- **진입점 `/`** — 풀스크린 메인 메뉴(닉네임 localStorage + 클래스 카드 + ENTER GAME). 연결은 `NetProvider`가 소유.
- **서버 브라우저** — 룸 `maxClients`/`setMetadata`, `getRooms`(GET `/matchmake/arena`) 리스트, 퀵매치 / roomId 직접 입장.
- **인게임 HUD** — 체력/탄약/무기, 타이머/목표, 리더보드, 킬피드(React DOM). 미니맵(벽·플레이어·헬스팩).
- **사망 오버레이** — 킬러 이름·클래스, 클래스 스왑 카드, 리스폰 카운트.
- **라운드 종료 오버레이** — 승자 + 스코어보드 + 다음 라운드 카운트. 전체 스코어보드(Shift).
- **설정/조작법** — 카메라 셰이크·이펙트 토글(localStorage 반영), 조작 키 표.
- **풀스크린** — 캔버스가 뷰포트 전체를 채우고 창 크기에 자동 리사이즈, 스크롤/여백 없음, 모바일 viewport 메타.
- **게임필 이펙트(Phaser)** — 트레이서, 머즐, 히트마커+셰이크, 사망 버스트, 피격 적색 플래시.

**배포(설정 완료, `master`)**
- `/health`(200 `{status:"ok"}` + CORS) — Colyseus 매치메이킹과 단일 포트 공존.
- `Dockerfile`(Node20, 서버 서브그래프만) · `.dockerignore` · `render.yaml`(Blueprint, `healthCheckPath:/health`) · `.env.example` · `docs/DEPLOY.md`(체크리스트/설정/주의점).

> 각 기능은 머지 전 **2-클라이언트 통합 스모크 테스트**로 검증함(임시 테스트 파일은 미커밋).

---

## 5. 미구현 / 잔여 작업

- **공개 호스팅** — 배포 설정은 완료(`master`)지만 실제 Render/Vercel 인스턴스는 미배포. 배포 설정을 `dev`로도 반영(master→dev 동기화) 필요.
- **추가 콘텐츠** — 추가 클래스/무기(Detective 등), 추가 모드(TDM/Hardpoint). 현재 단일 FFA.
- **폴리시** — 사운드 SFX, 킬스트릭 텍스트, 키 리매핑, PING/FPS 표시, 채팅.
- **자동화 테스트 러너** — 정식 단위/통합 스위트 없음(검증은 임시 tsx 스모크).
- **계정·클랜·상점·모드 시스템·영속 통계** — **의도적으로 범위 외(구현 안 함)**.

---

## 6. 서버 구조 (`apps/game-server`)

- **부트스트랩** `src/index.ts`: `new Server({ transport: new WebSocketTransport({ server: createServer(...) }) })`, `define("arena", ArenaRoom)`, `listen(PORT ?? 2567)`. **`master`에는 `/health` + CORS 핸들러** 추가.
- **스키마** `src/schema/GameState.ts`:
  - `Player`: `name, classId, weaponId, x, y, jumpY, angle, hp, maxHp, ammo, reloading, alive, kills, deaths, score, lastSeq`
  - `MatchState`: `mode, phase("playing"|"ended"), timeRemainingMs, targetScore, winnerId, winnerName`
  - `HealthPack`: `x, y, active`
  - `GameState`: `players: MapSchema<Player>`, `match`, `healthPacks: ArraySchema`
- **룸** `src/rooms/ArenaRoom.ts` (권위 시뮬 핵심):
  - `onCreate`: `maxClients=8`, `setMetadata({mode,map})`(서버 브라우저용), 30Hz 틱, 50ms 패치.
  - 서버 전용(미복제) Map: `queues`(이동 입력) · `latest`(조준/발사/점프) · `weapons`(무기별 런타임) · `prevFiring`(반자동 엣지) · `jumpVel`/`jumpReadyAt`(점프) · `respawnAt` · `pendingClass` · `packRespawnAt`.
  - 매 틱: 입력 큐 소비(`stepMovement`+벽충돌, `lastSeq`), 조준, **`applyJump`(홀드+지면+쿨다운 → `stepJump`)**, 재장전/발사, 헬스팩, FFA 종료 판정·리셋.
  - **발사** `fireWeapon`→`fireRay`: 펠릿 확산 레이, 벽 클램프 + 벽 앞 최근접 적만 피격(LOS), 데미지/킬/점수, `shot` 브로드캐스트.
  - **env 오버라이드:** `PORT`, `MAP_ID`, `FFA_TARGET_SCORE`, `FFA_DURATION_MS`, `FFA_END_SCREEN_MS`, `HP_RESPAWN_MS`, (`master`) `CORS_ORIGIN`.

---

## 7. 클라이언트 구조 (`apps/web`)

- **연결 소유 = React `game/net/NetProvider.tsx`**: Colyseus `Client`/`Room`을 컨텍스트로 보유. `connect({name,classId,roomId?})`(roomId면 `joinById`, 아니면 `joinOrCreate`), `disconnect()`, `getRooms()`(GET `/matchmake/arena`). `status`로 메뉴↔게임 전환.
- **`app/page.tsx`**(진입점): `NetProvider` → `Stage`. 미연결 시 `MainMenu`, 연결 시 `PhaserGame`(풀스크린). `/play`는 `/` 재export.
- **`game/PhaserGame.tsx`**: 풀스크린 `fixed inset:0` 래퍼, Phaser `Scale.RESIZE`(부모 100%·자동 리사이즈). 주입받은 `room`을 `ArenaScene`에 `init`으로 전달, 위에 `Hud`/`DeathOverlay` React 오버레이.
- **`game/scenes/ArenaScene.ts`** (렌더/입력 전담, 연결은 안 가짐):
  - `update()`: 트레이서 → `room.state` 폴링 → 뷰 동기화/헬스팩 → 로컬 입력+예측(이동·점프) → 렌더(본인=predicted, 원격=보간) → 조준선.
  - 입력: WASD, 마우스 조준, 좌클릭 발사, **Space 점프(홀드)**, R 재장전, Q 무기전환, 1/2/3 클래스. 매 프레임 `room.send("input",{seq,dtMs,moveX,moveY,aim,firing,jump})`.
  - 설정 반영: `getSetting("shake"/"effects")`로 셰이크/이펙트 토글.
- **React DOM 컴포넌트**: `MainMenu` · `ServerBrowser` · `SettingsModal` · `Hud`(+`Minimap`) · `DeathOverlay`. HUD/오버레이는 `room.state`를 폴링/구독해 렌더(`pointer-events:none`으로 조준/사격은 캔버스로 통과).

---

## 8. 네트워크 프로토콜 (`packages/shared/src/protocol.ts`)

**상태 동기화:** Colyseus Schema 델타(30Hz 시뮬 / 50ms 패치). 클라는 `room.state`를 읽기.

**Client → Server 메시지:**
| 타입 | 페이로드 | 설명 |
|------|----------|------|
| `input` | `InputMessage { seq, dtMs, moveX(-1..1), moveY(-1..1), aim(rad), firing, jump }` | 매 프레임 의도 전송 |
| `reload` | (없음) | 활성 무기 재장전 요청 |
| `switchWeapon` | (없음) | 주↔보조 전환 |
| `selectClass` | `SelectClassMessage { classId }` | **다음 리스폰에 적용** |

**입장:** `joinOrCreate("arena", JoinOptions{ name?, classId? })` 또는 `joinById(roomId, ...)`. 룸 목록은 GET `/matchmake/arena`.

**Server → Client 메시지(이벤트):**
| 타입 | 페이로드 | 용도 |
|------|----------|------|
| `shot` | `ShotMessage { by, sx, sy, ex, ey, hit }` | 트레이서/머즐/히트마커 |
| `kill` | `KillMessage { killerName, victimName }` | 킬피드 · 사망 오버레이 |

**핵심 상수:** `NET.TICKRATE=30`, `NET.PATCHRATE_MS=50`, `WORLD 2000×2000`,
`PLAYER{RADIUS16,SPEED320,MAX_HP100}`, `JUMP{STRENGTH270,GRAVITY900,COOLDOWN_MS250}`, `RESPAWN_MS2000`,
`HEALTH_PACK{HEAL50,RADIUS18,RESPAWN15000}`, `FFA{KILL_SCORE100,TARGET1500,DURATION240000,END5000}`, `MAX_INPUT_DT_MS=50`.
무기: machinegun(25/24/90/1500/750,auto) · sniper(100/5/1100/2200/1700,semi) · machine_pistol(12/5/60/1000/520,auto) · shotgun(25/6/800/1900/480,semi,4펠릿/16°).

---

## 9. 향후 우선순위 로드맵

**P0 — 공개 플레이(배포)**
1. 배포 설정을 `dev`로 동기화(master→dev) 후 실제 호스팅: game-server(Render, Docker, `/health`), web(Vercel, Root=`apps/web`, `NEXT_PUBLIC_GAME_SERVER_URL=wss://…`). 가이드: `docs/DEPLOY.md`.

**P1 — 콘텐츠**
2. 추가 클래스/무기(예: Detective 데저트이글), 추가 모드(TDM/Hardpoint).

**P2 — 폴리시 / 인프라**
3. 사운드 SFX, 킬스트릭 텍스트, 키 리매핑, PING/FPS, 채팅.
4. 정식 테스트 러너(vitest 등)로 스모크 테스트 영속화.

**범위 외(구현 안 함):** 계정/로그인 · 클랜 · 상점/코스메틱 · 모드(텍스처) 시스템 · 사설 서버.

---

## 부록 — 빠른 시작 / 개발 워크플로우

```bash
corepack enable && pnpm install
pnpm dev:server     # Colyseus  ws://localhost:2567
pnpm dev:web        # Next.js    http://localhost:3000  → / (메뉴 → 게임)
# 또는 동시: pnpm dev   |   타입체크: pnpm typecheck   |   빌드: pnpm build
```
- 멀티플레이 확인: 브라우저 탭 2개로 `/` 접속. 인게임 키: WASD · 마우스 · 클릭 · Space · R · Q · 1·2·3 · Shift.
- **검증 패턴(권장):** 임시 `smoke-*.mts` 작성 → 서버 띄우고 `tsx`로 두 클라이언트 시뮬 → **검증 후 삭제(미커밋)**. 포트 정리는 `fuser -k 2567/tcp`.
- **개발 워크플로우(합의됨):** `dev`에서 브랜치 생성 → 작업 → PR → `dev` 머지. `master`는 보호(릴리스 라인). 브랜치 접두사: `feat/…`, `fix/…`, `docs/…`, `refactor/…`.
