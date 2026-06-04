# 기술 설계 (Technical Design)

> 본 문서는 게임 설계([01-game-analysis.md](./01-game-analysis.md))를 **확정된 기술 스택** 위에서
> 어떻게 구현할지 정의한다. 코드는 포함하지 않으며 구조·계약(contract)·데이터 흐름을 다룬다.

## 확정 기술 스택

| 영역 | 기술 | 역할 |
|------|------|------|
| 프레임워크/호스팅 | **Next.js (App Router) + TypeScript** | 랜딩·로비·인증 UI, 게임 클라이언트 셸(shell) 호스팅 |
| 렌더링/입력 | **Phaser 3** | 탑다운 2D 렌더링, 입력 캡처, 클라이언트 예측/보간 표현 |
| 실시간 멀티플레이 | **Colyseus** | 권위(authoritative) 게임 서버, 룸, 바이너리 상태 동기화 |
| 백엔드/영속 | **Supabase** (Postgres + Auth + Storage) | 계정, 통계, 코스메틱, 리더보드, 인증 |
| 언어 공통 | **TypeScript** (모노레포 공유) | 클라/서버/스키마 타입·데이터 공유 |

### 역할 분리 원칙 (가장 중요)

```
실시간 게임 상태(위치/HP/사격/점수)  →  Colyseus (권위)   ← Supabase Realtime 사용 안 함
영속 데이터(계정/통계/코스메틱)        →  Supabase (Postgres)
화면·입력                              →  Phaser 3 (클라이언트, 렌더만)
페이지·라우팅·인증 UI                  →  Next.js
```

> **Supabase Realtime은 게임 틱 동기화에 사용하지 않는다.** 실시간 상태는 전적으로 Colyseus가 담당.
> Supabase는 "라운드 종료 후 결과 저장", "로그인", "코스메틱 조회" 같은 비실시간 영역만 담당한다.

---

## 1. 프로젝트 구조

**pnpm workspaces + Turborepo** 모노레포. 클라/서버가 동일한 스키마·상수·데이터를 공유하는 것이 핵심.

```
vertix-reboot/
├─ apps/
│  ├─ web/                      # Next.js (App Router) — 클라이언트 + 인증/로비 UI
│  │  ├─ app/
│  │  │  ├─ (marketing)/page.tsx        # 랜딩
│  │  │  ├─ play/page.tsx               # 게임 화면 (Phaser 마운트)
│  │  │  ├─ auth/                       # Supabase 로그인/콜백
│  │  │  └─ api/                        # (필요 시) BFF 라우트
│  │  ├─ game/                          # Phaser 통합 레이어 (클라이언트 전용)
│  │  │  ├─ PhaserGame.tsx              # dynamic import, ssr:false
│  │  │  ├─ scenes/                     # Boot, Lobby, Arena, HUD 씬
│  │  │  ├─ net/                        # Colyseus 클라이언트 래퍼, 예측/보간
│  │  │  └─ render/                     # 스프라이트/카메라/이펙트
│  │  └─ lib/supabase/                  # 브라우저/서버 Supabase 클라이언트
│  │
│  └─ game-server/              # Colyseus 권위 서버 (Node)
│     ├─ src/
│     │  ├─ index.ts                    # Colyseus 서버 부트스트랩
│     │  ├─ rooms/ArenaRoom.ts          # 룸: 입장/입력/시뮬 루프/종료
│     │  ├─ sim/                        # 권위 시뮬레이션 (이동/충돌/사격/데미지)
│     │  ├─ modes/                      # 모드 규칙 플러그인 (FFA, TDM...)
│     │  └─ persistence/                # Supabase 기록(결과/통계) 게이트웨이
│     └─ ...
│
├─ packages/
│  ├─ shared/                   # ⭐ 클라·서버 공유 (단일 진실 공급원)
│  │  ├─ schema/                        # Colyseus @colyseus/schema 상태 정의
│  │  ├─ data/                          # 클래스/무기/맵 데이터(JSON+타입)
│  │  ├─ sim-core/                      # 결정론적 시뮬 로직(클라 예측·서버 공유)
│  │  ├─ protocol/                      # 메시지 타입(입력/이벤트) 상수·타입
│  │  └─ constants.ts                   # 틱레이트, 패치레이트 등
│  └─ db/                       # Supabase 마이그레이션 + 생성된 DB 타입
│     ├─ migrations/
│     └─ types.ts                       # supabase gen types
│
├─ docs/design/                 # (현재) 설계 문서
├─ turbo.json
└─ pnpm-workspace.yaml
```

### 배포 토폴로지

| 컴포넌트 | 호스팅 | 비고 |
|----------|--------|------|
| `apps/web` (Next.js) | Vercel 등 | 정적/엣지, 클라이언트 전달 |
| `apps/game-server` (Colyseus) | 상태 유지 Node 호스트 (Fly.io/Render/VM/컨테이너) | **서버리스 불가** — 장시간 WebSocket·인메모리 룸 상태 필요 |
| Supabase | Supabase Cloud | DB/Auth/Storage |

> Colyseus는 인메모리 룸 상태와 지속 연결을 유지하므로 **서버리스/엣지에 올릴 수 없다.** Next.js와 별도 호스트로 분리.

---

## 2. 멀티플레이 구조

### 2.1 Colyseus 핵심 개념 매핑

| Colyseus 개념 | 본 프로젝트 적용 |
|---------------|------------------|
| **Room** | `ArenaRoom` — 한 경기(한 맵/모드 인스턴스). 동시 N명. |
| **Room State (Schema)** | `GameState` — 플레이어/투사체/픽업/매치 상태(아래 §6). |
| **Client → Server 메시지** | 플레이어 입력 커맨드(이동/조준/사격/재장전/클래스선택). |
| **Server → Client 메시지** | 단발 이벤트(킬 피드, 사운드 트리거, 라운드 종료). |
| **State Patch (자동)** | 상태 델타 바이너리 브로드캐스트(위치/HP/점수 등). |
| **matchMaker** | 모드/맵별 룸 배정, 인원 차면 새 룸 생성. |
| **onAuth** | 입장 시 Supabase JWT 검증(로그인 유저) / 게스트 허용. |

### 2.2 연결 흐름

```
[Next.js /play]
   1. (선택) Supabase 로그인 → access_token 획득
   2. colyseus.js Client.joinOrCreate("arena", { mode, token, nickname })
        ↓
[Colyseus ArenaRoom]
   3. onAuth(token) → Supabase JWT 검증 / 게스트 처리
   4. onJoin → GameState.players 에 Player 추가, 스폰
   5. 시뮬 루프 시작(이미 진행 중이면 합류)
        ↓
[런타임 루프]
   6. client.send("input", cmd)  (클라 → 서버, 고빈도)
   7. 서버: 고정 틱으로 시뮬 → GameState 갱신
   8. Colyseus: state patch 자동 브로드캐스트 (서버 → 클라)
   9. 클라: onStateChange → Phaser 보간 렌더 + 예측 보정
        ↓
   10. onLeave / 라운드 종료 → 결과 Supabase 기록
```

### 2.3 룸 라이프사이클 (ArenaRoom)

- `onCreate(options)`: 맵 로드, 모드 규칙 주입, `setSimulationInterval(tick, 1000/TICKRATE)` 등록, `setPatchRate(PATCHRATE)`.
- `onJoin(client, options)`: 플레이어 생성·스폰, 초기 클래스 부여.
- `onMessage("input", ...)`: 입력을 플레이어별 입력 버퍼에 적재(시뮬에서 소비).
- `simulationTick(dt)`: 입력 소비 → 이동/충돌/사격/데미지/점수/리스폰/픽업/모드 승리판정.
- `onLeave(client)`: 연결 종료 처리(`allowReconnection` 짧게 허용 가능).
- 종료 조건 충족: 결과 집계 → `persistence`로 Supabase 기록 → 룸 정리/다음 라운드.

---

## 3. 엔티티 구조

게임 내 모든 동적 객체를 **엔티티**로 통일한다. Colyseus Schema가 곧 네트워크 동기화 단위이므로,
**"동기화되는 엔티티"는 Schema로, "정적 정의(클래스/무기 스펙)"는 공유 데이터(JSON)** 로 분리한다.

### 3.1 엔티티 분류

| 엔티티 | 동기화 | 설명 |
|--------|--------|------|
| **Player** | Schema | 위치/속도/조준각/HP/무기상태/점수/생존상태 |
| **Projectile** | Schema (MVP 이후) | 로켓/유탄 등. 서버 권위 이동·충돌. (MVP는 히트스캔만 → 투사체 없음) |
| **Pickup (HealthPack/Lootcrate)** | Schema | 위치/활성여부/재스폰 타이머 |
| **Objective (Hardpoint)** | Schema (모드별) | 점유 영역 상태/점유자/진행도 |
| **Hitscan / Damage Event** | Message (비영속) | 즉발 이벤트, 상태가 아닌 1회성 신호(이펙트/사운드) |

### 3.2 엔티티 모델 (개념)

정적 정의와 런타임 상태를 분리:

```
정적(Definition, packages/shared/data)        런타임(State, Schema)
─────────────────────────────────────         ─────────────────────────
ClassDef   { hp, speed, loadout, ... }   →     Player.classId 로 참조
WeaponDef  { type, damage, mag, ... }     →     WeaponState.weaponId 로 참조
MapDef     { collision, spawns, ... }     →     룸 생성 시 로드(동기화 X, 클라도 동일 파일 보유)
```

> 정적 정의는 클라/서버가 **동일 파일(shared)** 로 보유 → 네트워크로 보낼 필요 없음.
> 동기화되는 것은 "어떤 정의를 쓰는지의 ID + 가변 상태"뿐 → 대역폭 최소화.

### 3.3 ID/소유권 규칙

- 모든 동기화 엔티티는 서버가 발급한 **고유 id**(MapSchema 키)로 식별.
- 권위는 전적으로 서버. 클라이언트는 자기 플레이어에 대해서만 **예측(prediction)** 수행, 나머지는 **보간(interpolation)**.

---

## 4. 클래스 구조

### 4.1 정적 정의 — `ClassDef` (shared/data/classes)

게임 분석 §2의 표를 데이터화. 런타임에 절대 바뀌지 않는 스펙.

```ts
// 개념적 형태 (실제 코드 아님)
type ClassDef = {
  id: ClassId;            // "triggerman" | "hunter" | "vince" | ...
  name: string;
  maxHp: number;          // Triggerman 100, Hunter 50, SprayNPray 200, Duck 800 ...
  moveSpeed: number;      // px/s (Run N Gun 최고)
  hitboxRadius: number;
  loadout: {
    primary: WeaponId;
    secondary?: WeaponId; // Hunter: machine_pistol, Nademan: 없음
  };
  sprite: SpriteKey;      // Phaser 텍스처 키
};
```

### 4.2 MVP 대상 (3종, [02-mvp-scope.md](./02-mvp-scope.md) 합의)

| ClassId | maxHp | primary | secondary | 발사 모델 |
|---------|------:|---------|-----------|-----------|
| `triggerman` | 100 | `machinegun` | — | 자동 히트스캔 |
| `hunter` | 50 | `sniper` | `machine_pistol` | 단발/자동 히트스캔 |
| `vince` | 100 | `shotgun` | — | 다중 히트스캔(펠릿) |

### 4.3 런타임 표현

- 클래스 자체는 상태가 아님. `Player.classId`(string)만 동기화.
- 클래스 변경은 **리스폰 화면에서만** 허용(게임 분석 §5). 서버가 검증 후 `classId` 교체 + HP/무기 재설정.
- 추가 클래스는 `ClassDef` JSON 추가만으로 확장(코드 변경 최소화).

---

## 5. 무기 구조

### 5.1 정적 정의 — `WeaponDef` (shared/data/weapons)

```ts
type WeaponDef = {
  id: WeaponId;
  type: "hitscan" | "projectile" | "cone" | "aoe"; // MVP: hitscan만
  damage: number;
  magSize: number;
  fireRateMs: number;     // 연사 간격
  reloadMs: number;
  spreadDeg: number;
  rangePx: number;
  pellets?: number;       // 샷건 = 다중 히트스캔 레이 수
  projectileSpeed?: number; // projectile 전용 (MVP 이후)
  splashRadius?: number;    // aoe/projectile 전용 (MVP 이후)
};
```

> 수치(fireRate/reload/range/spread)는 게임 분석 §3.3에서 **[추정]** 으로 표기됨 → 플레이테스트로 캘리브레이션.
> `damage/magSize`는 일부 [확인됨] (머신건 25/24, 스나이퍼 100, 데저트이글 50/6 등).

### 5.2 런타임 상태 — `WeaponState` (Schema, Player 내부)

```
WeaponState {
  weaponId: string;     // 현재 든 무기(주/보조 전환)
  ammoInMag: number;    // 현재 탄창 잔탄 (예비탄은 무한 → 추적 안 함)
  reloading: boolean;
  reloadEndsAt: number; // 서버 시간(ms)
  nextFireAt: number;   // 연사 쿨다운 게이트
}
```

### 5.3 발사 처리 (서버 권위, hitscan)

```
client → "fire" 입력 (조준각 포함)
   ↓ 서버 시뮬에서:
1. 검증: alive? reloading? now >= nextFireAt? ammoInMag > 0?
2. 히트스캔 레이캐스트(맵 충돌 + 적 히트박스), 펠릿 수만큼 반복
3. 명중 시 데미지 적용 → 대상 HP 감소 → 사망 시 킬/점수 처리
4. ammoInMag--, nextFireAt = now + fireRateMs
5. ammoInMag == 0 → 자동 재장전 시작
6. 1회성 "hit/shot" 이벤트 메시지 브로드캐스트(이펙트/사운드용)
```

- **사격 판정은 100% 서버**. 클라는 머즐플래시/예측 트레일만 즉시 표시(보정 가능).
- **랙 보상(lag compensation)**: 서버가 사수의 RTT만큼 과거 스냅샷으로 표적 위치를 되감아 판정(§8).

---

## 6. 상태 동기화 방식

### 6.1 Colyseus Schema = 동기화 단위

Colyseus는 `@colyseus/schema`로 정의된 상태의 **델타(변경분)만 바이너리로 자동 브로드캐스트**한다.
스키마는 `packages/shared/schema`에 두어 **서버(권위 쓰기)와 클라(colyseus.js 읽기)가 동일 정의**를 사용.

```
GameState (root Schema)
├─ players:     MapSchema<Player>
├─ pickups:     MapSchema<Pickup>
├─ projectiles: MapSchema<Projectile>   # MVP 이후
├─ match:       MatchState              # 모드/타이머/점수/단계
└─ (objectives) HardpointState 등 모드별  # 모드 이후

Player (Schema)
├─ id, nickname, team
├─ x, y, vx, vy, angle           # 이동/조준 (고빈도 변경)
├─ hp, maxHp, alive, respawnAt
├─ classId
├─ weapon: WeaponState
├─ kills, deaths, score
└─ lastProcessedInputSeq         # 클라 reconciliation 용

Pickup (Schema): id, kind, x, y, active, respawnAt
MatchState (Schema): mode, mapId, phase, timeRemaining, teamScores, targetScore
```

### 6.2 레이트(권장 기본값) — `shared/constants`

| 항목 | 값(제안) | 의미 |
|------|---------|------|
| `TICKRATE` | 30~60 Hz | 서버 시뮬 주기(`setSimulationInterval`) |
| `PATCHRATE` | 50 ms (20 Hz) | 상태 패치 브로드캐스트(`setPatchRate`) |
| 입력 전송 | 매 클라 프레임 또는 30Hz | 입력 커맨드 송신 빈도 |

> 시뮬은 빠르게(권위·판정 정확도), 패치는 적당히(대역폭). 클라 보간이 그 사이를 메운다.

### 6.3 클라이언트 측 처리 (Phaser)

1. **보간(Interpolation)** — 남(타 플레이어)의 위치는 수신 스냅샷 사이를 시간 보간하여 부드럽게.
2. **예측(Prediction)** — 내 캐릭터는 입력 즉시 로컬 적용(이동), 서버 응답을 기다리지 않음.
3. **보정(Reconciliation)** — 서버가 보낸 `lastProcessedInputSeq` 기준으로, 그 이후 미반영 입력을 재적용해 예측 오차 수정.
4. **이벤트** — 킬피드/사운드는 메시지(`onMessage`)로 받아 HUD/오디오에 반영(상태 아님).

### 6.4 무엇을 Schema로, 무엇을 Message로?

| 종류 | 채널 | 이유 |
|------|------|------|
| 지속 상태(위치/HP/점수/픽업) | **Schema patch** | 신규 입장자도 현재값 동기화, 델타 효율 |
| 1회성 신호(피격 이펙트/킬피드/사운드/라운드 종료 알림) | **Message** | 상태로 남길 필요 없는 순간 이벤트 |
| 클라 입력 | **Message** | 서버가 검증·시뮬에 소비 |

---

## 7. 데이터베이스 설계 (Supabase / Postgres)

> 실시간 게임 상태는 저장하지 않는다. **계정·영속 통계·코스메틱·리더보드**만 다룬다.
> 기록 쓰기는 **게임 서버(서비스 롤 키)** 가 라운드 종료 시 수행. 클라이언트 직접 쓰기는 RLS로 제한.

### 7.1 테이블 개요

| 테이블 | 목적 | 핵심 컬럼 |
|--------|------|-----------|
| `profiles` | 유저 프로필(=auth.users 1:1) | `id (uuid, FK auth.users)`, `username (unique)`, `level`, `xp`, `created_at` |
| `matches` | 경기 메타 | `id`, `mode`, `map_id`, `started_at`, `ended_at`, `winner` |
| `match_participants` | 경기별 개인 성적 | `match_id`, `profile_id`, `class_id`, `kills`, `deaths`, `score`, `result` |
| `cosmetics` | 코스메틱 카탈로그 | `id`, `name`, `slot`, `rarity` |
| `player_cosmetics` | 보유/장착 | `profile_id`, `cosmetic_id`, `equipped`, `acquired_at` |
| `player_stats` | 누적 집계(통계 캐시) | `profile_id`, `total_kills`, `total_deaths`, `wins`, `matches_played` |

### 7.2 관계

```
auth.users 1─1 profiles 1─┬─< match_participants >─┐
                          ├─< player_cosmetics >── cosmetics
                          └─1 player_stats
matches 1─< match_participants
```

### 7.3 핵심 설계 결정

- **인증**: Supabase Auth(이메일/OAuth/익명). 게스트는 익명 세션 또는 비로그인(서버 메모리만, DB 기록 없음).
- **JWT 검증**: 클라가 받은 access_token을 Colyseus `onAuth`에서 검증 → 신뢰 가능한 `profile_id` 확보.
- **쓰기 권한**: 경기 결과/통계 갱신은 **게임 서버가 service_role**로 수행(클라 위변조 차단).
- **RLS(Row Level Security)**:
  - `profiles`/`player_cosmetics`/`player_stats`: 본인 행만 select, update는 서버 또는 제한적.
  - `matches`/`match_participants`: 클라 insert 금지(서버 전용), select는 공개/본인 한정 정책.
- **리더보드**: `player_stats` 기반 정렬 쿼리 또는 **materialized view**(주기 갱신)로 부하 분리.
- **코스메틱 보상**(원본의 라운드 종료 랜덤 지급): 서버가 결과 처리 시 `player_cosmetics`에 insert. (MVP 이후)
- **DB 타입 안전성**: `supabase gen types typescript` → `packages/db/types.ts`로 TS 타입 공유.

### 7.4 MVP 범위의 DB

MVP는 게스트 중심이므로 DB는 **최소**로 시작 가능:

- 필수: `profiles`(로그인 시), 라운드 결과는 게임 서버 메모리 → (선택) `matches`/`match_participants` 기록.
- 보류: 코스메틱/리더보드/통계 캐시는 Phase 2.

---

## 8. 서버 권한(Authoritative Server) 설계

### 8.1 원칙

> **클라이언트는 입력만 보내고, 서버만이 진실을 결정한다.**
> 위치·충돌·데미지·사망·점수·픽업·승패는 전부 서버 시뮬 결과. 클라 값은 표시/예측일 뿐.

### 8.2 입력 모델 (Client → Server)

클라는 상태가 아니라 **의도(입력)** 를 보낸다. 각 입력에 **시퀀스 번호**를 부여.

```
InputCommand {
  seq: number;          // 단조 증가 (reconciliation 키)
  dtMs: number;         // 이 입력이 커버한 시간
  moveX, moveY: -1..1;  // 이동 의도
  aim: number;          // 조준각(라디안)
  buttons: bitflags;    // fire / reload / switchWeapon
}
```

- 서버는 입력을 **검증 후** 시뮬에 적용(속도 상한, 사격 쿨다운, 생존 여부 등).
- 처리한 마지막 seq를 `Player.lastProcessedInputSeq`로 동기화 → 클라 보정 기준.

### 8.3 시뮬레이션 루프 (서버, 고정 틱)

```
setSimulationInterval(dt):
  for each player:
    소비할 입력 커맨드들을 버퍼에서 꺼냄
    이동 적용(속도/충돌: 맵 타일·벽) → 위치 클램프
    사격/재장전 처리(쿨다운·탄창·히트스캔 판정·데미지)
  픽업 충돌(힐팩) 처리 + 재스폰 타이머
  사망/리스폰 처리(딜레이·안전스폰·무적)
  모드 규칙 tick(점수·승리 조건)
  match.timeRemaining 갱신 → 종료 판정
```

- 시뮬 코어 로직은 `packages/shared/sim-core`에 두어 **클라 예측이 서버와 동일 규칙**을 쓰게 한다(결정론 지향).

### 8.4 랙 보상 (Lag Compensation) — 히트스캔 판정

```
1. 서버는 최근 N틱의 플레이어 위치 스냅샷 링버퍼를 보관.
2. 사수의 "fire" 처리 시, 사수 RTT/2 만큼 과거 시점으로 표적 위치를 되감음(rewind).
3. 그 과거 좌표 기준으로 레이캐스트 판정 → 명중 확정.
4. 데미지는 현재 시점에 적용.
```

- 효과: "내 화면에서 맞췄는데 안 맞는" 문제 완화. (MVP에서 우선순위 높음 — 게임 분석 손맛 항목)

### 8.5 보안/치트 방지 (서버 검증 목록)

| 항목 | 서버 검증 |
|------|-----------|
| 이동 | 클래스 `moveSpeed`·dt 기반 최대 이동거리 초과 거부, 벽 통과 거부 |
| 사격 | `fireRateMs` 쿨다운, `ammoInMag>0`, 생존 상태 확인 |
| 데미지 | 클라가 보낸 "데미지"는 절대 신뢰 안 함 — 서버가 계산 |
| 클래스 변경 | 리스폰 상태에서만 허용 |
| 인증 | `onAuth`에서 Supabase JWT 검증, profile_id 위조 차단 |
| 결과 기록 | service_role로 서버만 DB 기록 |

### 8.6 연결 견고성

- `allowReconnection(client, seconds)`로 짧은 끊김 복구 허용(모바일/지터 대비).
- `onLeave`에서 미복구 시 엔티티 정리 + (필요 시) 결과 반영.

---

## 부록: 데이터 흐름 한눈에

```
┌────────────── Next.js (web) ──────────────┐         ┌──── Supabase ────┐
│  React 로비/인증 UI                         │  auth   │  Auth (JWT)      │
│  Phaser 3 (Arena 씬)                        │◀───────▶│  Postgres        │
│   ├─ 입력 캡처 → InputCommand               │  결과조회 │  (profiles 등)   │
│   ├─ 예측/보간 렌더                          │         └────────▲─────────┘
│   └─ colyseus.js client                     │                  │ service_role
└───────────────┬────────────────────────────┘                  │ (결과 기록)
                │ WebSocket (입력 msg / state patch)              │
                ▼                                                 │
┌──────────── Colyseus (game-server) ─────────────────────────────┘
│  ArenaRoom: onAuth(JWT) / onJoin / onMessage("input")           │
│  setSimulationInterval(TICKRATE): 권위 시뮬(이동/사격/데미지/점수) │
│  GameState(Schema) ──setPatchRate──▶ 클라 자동 동기화             │
│  종료 시 persistence → Supabase 기록                             │
└─────────────────────────────────────────────────────────────────┘
```

## 부록: 착수 전 확정 필요 항목

- [ ] `TICKRATE` / `PATCHRATE` 최종값(목표 동시 인원에 따라)
- [ ] 목표 동시 인원(룸당) — 8 / 16
- [ ] 게스트 정책(익명 Supabase 세션 vs 완전 비로그인)
- [ ] MVP에서 경기 결과 DB 기록 여부(기록 vs 메모리만)
- [ ] 결정론 시뮬 수준(완전 결정론 vs 서버 권위 + 클라 근사 예측)
