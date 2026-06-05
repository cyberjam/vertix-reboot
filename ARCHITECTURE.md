# ARCHITECTURE.md

Vertix.io Reboot의 런타임 아키텍처. 전체 현황은 [PROJECT_STATE.md](./PROJECT_STATE.md), 설계 배경은
[docs/design/](./docs/design/README.md) 참조. 기준 커밋 `3158d47` (PR #16).

핵심 원칙: **서버 권위(authoritative)** · **Top-down TPS** · **`@vertix/shared` 단일 진실 공급원**
(정적 정의는 공유, 가변 상태는 Colyseus Schema, 결정론 이동은 클라/서버 공용).

---

## 1. Entity 구조

엔티티는 **정적 정의(Definition)** 와 **런타임 상태(State)** 로 분리한다.

```
정적 정의 (packages/shared, 불변·코드상수)        런타임 상태 (Colyseus Schema, 복제됨)
──────────────────────────────────────────        ─────────────────────────────────────
ClassDef   { id,name,maxHp,primary,secondary,color }   Player    (id=MapSchema 키)
WeaponDef  { id,damage,magSize,fireRateMs,...,pellets } MatchState
MapDef     { walls[],spawnPoints[],healthPacks[] }      HealthPack
                       ▲ Player.classId / weaponId 로 참조       ▲ 서버만 write, 클라 read
```

**복제되는 엔티티 (서버 권위, `GameState`):**
| 엔티티 | 컬렉션 | 핵심 필드 |
|--------|--------|-----------|
| `Player` | `players: MapSchema<Player>` (키=sessionId) | name, classId, weaponId, x, y, angle, hp, maxHp, ammo, reloading, alive, kills, deaths, score, lastSeq |
| `HealthPack` | `healthPacks: ArraySchema<HealthPack>` | x, y, active |
| `MatchState` | `match: MatchState` (단일) | mode, phase, timeRemainingMs, targetScore, winnerId, winnerName |

**엔티티가 아닌 것:**
- **총알/히트스캔** — 상태로 보관하지 않는 **1회성 이벤트**. 서버가 즉시 레이캐스트로 판정하고 `shot` 메시지(VFX용)만 브로드캐스트. (투사체 무기는 아직 없음 → 미래에 도입 시 `Projectile` 스키마 추가 예정.)
- **벽** — `MapDef.walls`(정적 데이터). 클라/서버가 동일 파일을 보유하므로 네트워크로 보내지 않음.

**설계 의도:** 동기화 대상은 "어떤 정의를 쓰는지의 ID + 가변 상태"뿐 → 대역폭 최소화, 정의 변경은 코드 한 곳(`shared`)에서.

---

## 2. Room 구조 (`apps/game-server/src/rooms/ArenaRoom.ts`)

한 경기 = 하나의 `ArenaRoom` 인스턴스 (Colyseus `Room<GameState>`).

```
onCreate → setState(GameState) · 맵 로드(getMap) · 헬스팩 시드 · setPatchRate(50ms)
         · onMessage 등록(input/reload/switchWeapon/selectClass)
         · setSimulationInterval(update, 1000/30)   // 30Hz 권위 틱
onJoin   → Player 생성 · pickSpawn(적과 가장 먼 스폰) · equipClass(클래스 HP/무기/탄약)
onLeave  → 모든 서버측 맵에서 해당 sessionId 제거
update(dt) [매 틱]:
   match 시간 차감 / phase 전환(playing↔ended, 종료 후 자동 reset)
   각 Player:
     dead?  → 입력 ack + respawnAt 도달 시 respawn
     alive? → consumeMovement(입력 큐 소비, stepMovement+벽충돌, lastSeq)
            → angle 갱신 · applyReload · applyFiring(자동=홀드 / 반자동=엣지)
            → player.ammo/reloading ← 활성 무기 런타임 동기화
   updateHealthPacks(픽업/재생성)
   목표 점수/시간 종료 판정 → endMatch
```

**서버 전용(미복제) 상태 — Room 필드 Map들:**
| 필드 | 용도 |
|------|------|
| `latest: Map<id,{aim,firing}>` | 최신 조준/발사(즉응) |
| `queues: Map<id,InputMessage[]>` | 순서 보장 이동 입력 큐(재조정용), 틱당 ≤10 소비 |
| `weapons: Map<id, Map<weaponId, WeaponRuntime>>` | 무기별 ammo/nextFireAt/reloadEndsAt/reloading |
| `prevFiring: Map<id,boolean>` | 반자동 엣지(클릭당 1발) 판정 |
| `respawnAt: Map<id,number>` · `pendingClass: Map<id,string>` | 리스폰 타이머 · 다음 리스폰에 적용할 클래스 |
| `packRespawnAt: number[]` | 헬스팩별 재생성 시각 |

**env 오버라이드(튜닝/테스트):** `PORT`, `MAP_ID`, `FFA_TARGET_SCORE`, `FFA_DURATION_MS`, `FFA_END_SCREEN_MS`, `HP_RESPAWN_MS`.

---

## 3. Weapon 구조

**정적 `WeaponDef` (`shared/gameplay.ts`):** `{ id, name, damage, magSize, fireRateMs, reloadMs, rangePx, auto, pellets?, spreadDeg? }`
- `auto:true` = 홀드 연사 / `auto:false` = 클릭당 1발(반자동, 서버 엣지 판정)
- `pellets`/`spreadDeg` = 산탄(샷건) — 펠릿 수만큼 확산 레이

| weaponId | dmg | mag | fireRate | reload | range | auto | 특이 |
|----------|----:|----:|----:|----:|----:|------|------|
| machinegun | 25 | 24 | 90 | 1500 | 750 | ✔ | — |
| sniper | 100 | 5 | 1100 | 2200 | 1700 | semi | 완전 정확·원샷 |
| machine_pistol | 12 | 5 | 60 | 1000 | 520 | ✔ | 근접 백업 |
| shotgun | 25 | 6 | 800 | 1900 | 480 | semi | 4펠릿/16° |

**클래스→무기 매핑(`ClassDef`):** Triggerman→machinegun · Hunter→sniper(+machine_pistol 보조) · Vince→shotgun.

**런타임:** 각 플레이어는 보유 무기마다 `WeaponRuntime{ammo,nextFireAt,reloadEndsAt,reloading}`를 가짐(서버). 활성 무기의 `ammo/reloading`만 `Player` 스키마로 복제.

**발사 파이프라인(서버):**
```
applyFiring → (자동:firing / 반자동:firing&&!prevFiring) && !reloading && ammo>0 && now>=nextFireAt
  → ammo-- , nextFireAt=now+fireRateMs
  → fireWeapon → for(pellets): fireRay(angle ± random spread)
       fireRay: 벽까지 레이 클램프(rayAabbDistance) → 그 안쪽 최근접 적(rayCircleDistance)만 피격(LOS)
                → damage 적용 / 사망 시 handleKill(+score, kill 브로드캐스트)
                → "shot" 브로드캐스트(by, sx,sy,ex,ey,hit)
  → ammo==0 시 자동 재장전
```

---

## 4. ECS 여부

**정식 ECS 아님.** **데이터 주도 + 권위 시뮬 (systems-유사)** 하이브리드.
- **Components≈** 정적 정의(`ClassDef`/`WeaponDef`/`MapDef`) + 복제 상태(`Player`/`MatchState`/`HealthPack` Schema) + 서버 전용 Map(WeaponRuntime 등).
- **Systems≈** `ArenaRoom.update()` 내 메서드(`consumeMovement`/`applyReload`/`applyFiring`/`updateHealthPacks`)가 매 틱 상태를 순회·변형.
- **Entities≈** `MapSchema/ArraySchema` 항목(런타임 추가/삭제).
- 별도 ECS 라이브러리/아키타입/쿼리 없음. 엔티티 종류가 적고(Player/HealthPack) 규모가 작아 **의도적으로 단순 유지**. 엔티티 종류가 늘면(투사체·픽업·오브젝트 다양화) 경량 ECS 도입을 재검토.

---

## 5. Phaser Scene 구조 (`apps/web/game`)

```
app/play/page.tsx → dynamic(PhaserGame, { ssr:false })
PhaserGame.tsx    → 브라우저에서 Phaser 지연 로드 · arcade physics · new Phaser.Game({ scene:[ArenaScene] })
                    언마운트 시 game.destroy(true)
ArenaScene.ts     → (현재 클라 로직 전부 집중: 접속 + 렌더 + 입력 + 예측 + HUD)
```

**ArenaScene 책임 (단일 씬):**
- `create()`: 월드(그리드/경계), 맵 벽/헬스팩 마커, graphics(트레이서/조준), 키 바인딩, HUD 텍스트, **연결(`connect`)**.
- `connect()`: `new Client(NEXT_PUBLIC_GAME_SERVER_URL)` → `joinOrCreate("arena",{name,classId})`, `onMessage(shot/kill)` 등록.
- `update(dt)`: 트레이서/킬피드 → `room.state` 폴링 → 뷰 동기화(생성/제거/색/이름) → 헬스팩 → **로컬 입력+예측 재조정** → 렌더(본인=predicted, 원격=보간) → 조준선 → HUD/스코어보드/매치/배너.
- **뷰 관리:** `views: Map<sessionId, {rect,muzzle,label,...}>` — 상태와 표시 객체 매핑.

> **현황/주의:** 씬이 하나뿐이고 **Colyseus 연결을 씬이 소유**한다. UI 개선(메뉴/오버레이) 착수 시
> [06-ui-ux-plan](./docs/design/06-ui-ux-plan.md)의 **U1: 연결을 React(NetProvider)로 이전 + ArenaScene을 `room` 주입형으로 리팩터**가 선행 권장.
> 향후 분리 예: `BootScene`(프리로드) / `ArenaScene`(게임) / DOM 오버레이(메뉴·사망·라운드종료).

---

## 6. Socket 이벤트 (네트워크 계약)

> **전송 계층:** raw socket.io가 아니라 **Colyseus(WebSocket) + Schema**. 지속 상태는 **Schema 델타 자동 동기화**(30Hz 시뮬 / 50ms 패치), 1회성 신호만 **메시지(이벤트)**. 타입 정의: [`packages/shared/src/protocol.ts`](./packages/shared/src/protocol.ts).

**입장:** `client.joinOrCreate("arena", JoinOptions { name?, classId? })`

**Client → Server (room.send):**
| 이벤트 | 페이로드 | 처리 |
|--------|----------|------|
| `input` | `InputMessage { seq, dtMs, moveX(-1..1), moveY(-1..1), aim(rad), firing }` | 이동 큐 적재 + 최신 조준/발사 갱신 (매 프레임) |
| `reload` | — | 활성 무기 재장전 큐잉 |
| `switchWeapon` | — | 주↔보조 전환(보조 보유 클래스) |
| `selectClass` | `SelectClassMessage { classId }` | **다음 리스폰에 적용**(pendingClass) |

**Server → Client (room.onMessage):**
| 이벤트 | 페이로드 | 용도 |
|--------|----------|------|
| `shot` | `ShotMessage { by, sx, sy, ex, ey, hit }` | 트레이서/머즐 · `by`==본인 & hit 시 히트마커+셰이크 |
| `kill` | `KillMessage { killerName, victimName }` | 킬로그/킬피드 |

**상태 동기화(메시지 아님):** `room.state` = `GameState{ players, match, healthPacks }`. 클라는 `update()`에서 폴링하여 뷰/HUD/스코어보드를 갱신. `Player.lastSeq`로 클라 예측 재조정.

**레이트 상수:** `NET.TICKRATE=30`, `NET.PATCHRATE_MS=50`, `MAX_INPUT_DT_MS=50`(이동 dt 클램프, 스피드핵 방지).
