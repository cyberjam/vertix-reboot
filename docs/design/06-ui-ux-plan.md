# UI/UX 개선안 — Vertix의 장점만 흡수 (v0.1)

원본 **Vertix Online**의 UI와 게임 흐름을 *참고*하되 **복원은 목표가 아니다.** 현재 Reboot의 방향
(즉시 플레이 · 로그인 없음 · 빠른 매칭 · 클래스 기반 FPS · 웹 브라우저)에 맞춰, Vertix에서
**메인 메뉴 구조 / 서버 브라우저 / 클래스 선택 / 리스폰 기반 게임 루프** 4가지만 흡수한다.

> **구현하지 않음(명시적 제외):** 계정·로그인, 클랜, 상점/코스메틱, 모드(텍스처) 시스템,
> 사설 서버 IP/비밀번호, 채팅(후순위), 광고.

본 문서는 **설계**다. 코드는 포함하지 않는다.

---

## 1. Vertix 참고 분석 (흡수 대상 4가지)

첨부된 `index.html` + `app.js` 분석 요약. ✅ = 흡수, ⛔ = 제외.

### 1.1 메인 메뉴 구조
Vertix `#startMenuWrapper`: 타이틀 → **Player Name 입력 → ENTER GAME** (엔터키로도 시작) → LEADERBOARDS / SETTINGS / CONTROLS. 우측 `#messageWrap` 탭(SETUP/ACCOUNT/MODS).
- ✅ **이름 + 큰 ENTER 버튼 = 즉시 플레이** (엔터키 단축), 애니메이션 메뉴 배경
- ✅ **SETTINGS**(그래픽/UI 토글), **CONTROLS**(키 리매핑, localStorage 저장)
- ⛔ ACCOUNT 탭(로그인/클랜/프로필), MODS 탭, 광고, 리더보드(영속) 

### 1.2 서버 브라우저
Vertix SETUP 탭의 `lobbySelector`: **Join a Server**(IP/비밀번호), **Create a Server**(모드 체크박스 9종·인원 2-8·HP/속도 배수·비밀번호), 현재 서버 표시.
- ✅ **서버(룸) 목록 + 현재 서버 표시** 개념, 인원 표시, 퀵 조인
- ⛔ IP 직접 입력·비밀번호·사설 서버 생성·모드 선택(모드 미구현)·HP/속도 배수
- → Reboot는 **Colyseus 매니지드 룸**이므로 "서버 브라우저 = 룸 리스트"로 재해석. 기본은 **퀵매치**, 선택적으로 **룸 둘러보기**.

### 1.3 클래스 선택
Vertix SETUP 탭 `LOADOUT`: Class + Primary/Secondary(+Hat/Shirt/Spray 코스메틱). `classSelector`로 클래스 교체. 입장/리스폰 시 적용.
- ✅ **클래스 + 무기 로드아웃을 입장 전 카드형으로 선택**, 스탯/역할 표시
- ⛔ Hat/Shirt/Spray/Camo 코스메틱
- → 현재 Reboot는 인게임 `1/2/3` 키로만 선택. 이를 **메뉴 카드 + 리스폰 오버레이**로 승격(키도 유지).

### 1.4 리스폰 기반 게임 루프
Vertix: ENTER GAME → `respawn` → 플레이 → 사망 시(이벤트 `3`) 1.3s 후 **메뉴 오버레이 재등장**(로드아웃 조정 후 재입장) → 라운드 종료(이벤트 `7`) **스탯 보드 + 승패 + 모드 투표 + "X: UNTIL NEXT ROUND"**(이벤트 `8`). 킬 시 "Double/Triple/Multi/Ultra Kill" 텍스트, 피격 스크린 셰이크.
- ✅ **사망 → (클래스 스왑 가능) → 리스폰**, **라운드 종료 → 스코어보드 + 다음 라운드 카운트다운**, **킬스트릭 피드백**
- ⛔ 모드 투표(모드 미구현 — 단일 FFA), 보스/팀 전용 텍스트

---

## 2. 현재 Reboot 상태 & 격차

| 영역 | 현재 | 격차(개선) |
|------|------|------------|
| 진입 | `/play`가 Phaser를 즉시 마운트하고 자동 `joinOrCreate` | **메뉴 없음** — 이름/클래스/룸 선택 화면 부재 |
| 이름 | 클라가 `Guest####` 자동 생성 | 입력·기억(localStorage) 불가 |
| 클래스 선택 | 인게임 `1/2/3` 키 | 시각적 선택 화면·스탯 안내 부재 |
| 서버 | 단일 `arena` 자동 조인 | 룸 목록/인원/퀵매치 UI 부재 |
| 사망 | Phaser HUD 텍스트 "respawning…" | 클래스 스왑 오버레이·킬러 표시 부재 |
| 라운드 종료 | Phaser 배너(winner) | DOM 스코어보드/다음 라운드 UX 빈약 |
| 설정/컨트롤 | 없음 | 그래픽/감도/키 설정 부재 |
| HUD | Phaser(HP/탄약/점수/타이머/킬피드/조준선) | 양호 — 유지 |

---

## 3. 제안 아키텍처 — DOM 메뉴 + Canvas 게임 (Vertix와 동일 철학)

Vertix는 **메뉴/메타 UI = DOM**, **게임 = canvas**로 분리했다. Reboot도 동일하게:

```
Next.js (React, DOM)                         Phaser (Canvas)            Colyseus
─────────────────────────────────            ───────────────            ─────────────
· 메인 메뉴 / 서버 브라우저                    · 월드·플레이어 렌더         · arena 룸
· 클래스 선택 카드                             · 조준선/트레이서/이펙트     · 매치메이킹
· 사망 오버레이 / 라운드 종료 스코어보드        · 인게임 코어 HUD(선택)      · getAvailableRooms
· 설정 / 컨트롤                                                            · room.state(공유)
        │  selected {name, class, roomId}            ▲ 같은 room 인스턴스 구독
        └───────────── React가 Colyseus 연결 소유 ───┘
```

### 3.1 핵심 결정: **연결을 React가 소유**
현재는 Phaser(ArenaScene)가 룸을 직접 연결한다. 개선안에서는 **React 레이어가 Colyseus `client`/`room`을 소유**하고, 같은 `room`을 Phaser에 주입한다. 이유:
- 서버 브라우저(룸 목록)와 사망/종료 오버레이가 **room.state를 DOM에서 읽어야** 함.
- 메뉴↔게임 화면 전환을 React 상태머신으로 깔끔히 관리.
- Phaser는 "이미 연결된 room"을 받아 렌더/입력만 담당(관심사 분리).

### 3.2 React 화면 상태머신
```
menu ──(PLAY/Quick)──► connecting ──► playing ──► roundEnd ──► (다음 라운드) playing
  ▲                                      │
  └──────────────(나가기)────────────────┘
playing 중 사망 → death 오버레이(자식 상태, 게임은 계속 렌더)
```
- `menu`: 메인 메뉴 + 서버 브라우저 + 클래스 선택 (Phaser 미마운트, 배경만)
- `connecting`: 로딩 스피너("CONNECTING") — Vertix 동일
- `playing`: PhaserGame 마운트 + DOM 오버레이(HUD 보조/사망/스코어보드 토글)
- `death`/`roundEnd`: room.state 기반 DOM 오버레이

---

## 4. 화면별 설계 (와이어프레임)

### 4.1 메인 메뉴 — 즉시 플레이
```
┌───────────────────────── VERTIX REBOOT ─────────────────────────┐
│                                                                  │
│     [ 닉네임: ____________ ]   (localStorage 기억)               │
│                                                                  │
│     클래스:  ▢Triggerman   ▢Hunter   ▢Vince     ← 카드 3개        │
│                                                                  │
│            ╔══════════════════════════╗                         │
│            ║        ▶  P L A Y         ║   ← 퀵매치(가장 빠른 룸) │
│            ╚══════════════════════════╝                         │
│                                                                  │
│     [ 서버 둘러보기 ]   [ 설정 ]   [ 조작법 ]                     │
└──────────────────────────────────────────────────────────────────┘
```
- **PLAY** = 선택 클래스로 즉시 퀵매치(joinOrCreate). Enter 키 단축.
- 닉네임 비우면 `Guest####`. 클래스 기본 Triggerman.
- 애니메이션 배경(Phaser 데모 씬 or CSS) — 후순위.

### 4.2 서버 브라우저 — 룸 리스트 + 퀵매치
```
┌─────────────────── 서버 브라우저 ───────────────────┐
│  [ ⚡ 퀵매치 ]                         [ 새로고침 ]   │
│  ───────────────────────────────────────────────── │
│  룸          모드   맵        인원      상태         │
│  arena #a3   FFA    Arena01   5/8      ● 진행중  [입장]│
│  arena #7c   FFA    Arena01   2/8      ● 대기    [입장]│
│  (빈 룸 없으면 자동 생성)                            │
└──────────────────────────────────────────────────────┘
```
- 데이터: `client.getAvailableRooms("arena")` → `{roomId, clients, maxClients, metadata{mode,map}}`.
- **퀵매치**가 기본 동선. 룸 리스트는 "둘러보기" 선택 시.
- 서버측 준비: 룸에 `maxClients` 설정 + `setMetadata({mode:"ffa", map:"arena01"})`.
- ⛔ 사설/IP/비밀번호 없음. (향후 모드 추가 시 모드 필터만 확장)

### 4.3 클래스 선택 카드
```
┌ Triggerman ┐ ┌ Hunter ─────┐ ┌ Vince ──────┐
│ HP 100      │ │ HP 50       │ │ HP 100      │
│ 머신건      │ │ 스나이퍼     │ │ 샷건(4펠릿) │
│ 올라운더    │ │ +머신피스톨  │ │ 근접 폭딜   │
│ [선택됨✓]   │ │ 원거리 처형  │ │ [선택]      │
└─────────────┘ └─────────────┘ └─────────────┘
```
- 스탯/역할은 `@vertix/shared`의 `CLASSES`/`WEAPONS`에서 자동 표기(단일 진실 공급원).
- 메인 메뉴·사망 오버레이에서 동일 컴포넌트 재사용.

### 4.4 인게임 HUD (유지 + 소폭 개선)
- **유지(Phaser, 월드 내 성능 필요):** 조준선/레티클, 트레이서, 머즐, 사망 버스트, 체력바/이름 라벨.
- **DOM로 승격 검토(선명·접근성):** 좌상단 클래스/무기/탄약/HP/점수, 상단 타이머/목표, 우측 스코어보드, 킬피드.
- Vertix 참고 추가: **미니맵**(후순위), **PING/FPS 토글**, **킬스트릭 텍스트**("Double Kill" 등).
- Tab(또는 Shift) 누름 → **전체 스코어보드** 오버레이(Vertix `leaderboardKey`).

### 4.5 사망 오버레이 — 리스폰 + 클래스 스왑
```
┌──────────────── 당신은 처치되었습니다 ────────────────┐
│        killed by  ▸ <KillerName> (Hunter)            │
│                                                       │
│   다음 클래스:  ▢Triggerman  ▢Hunter  ▢Vince          │
│                                                       │
│            리스폰까지  2 …                            │
└───────────────────────────────────────────────────────┘
```
- 서버는 이미 일정 딜레이 후 자동 리스폰 + **클래스는 리스폰 시 적용**. 오버레이는 그 사이 클래스 변경 UI를 제공(키 `1/2/3`도 유지).
- 킬러 이름: `shot`/`kill` 메시지에 이미 `by`/killerName 존재 → 활용.

### 4.6 라운드 종료 — 스코어보드 + 다음 라운드
```
┌──────────────── ROUND OVER ────────────────┐
│              🏆  Winner: <Name>             │
│  #  NAME        SCORE  K   D                 │
│  1  Alpha        1500  15  4   ◄ 본인 강조   │
│  2  Bravo         900   9  7                 │
│  ...                                         │
│            다음 라운드  4 …                  │
└──────────────────────────────────────────────┘
```
- `room.state.match`(phase/winnerName/timeRemaining) + players로 구성. 데이터 이미 존재.
- ⛔ 모드 투표는 단일 FFA라 생략(모드 추가 시 부활).

### 4.7 설정 / 조작법
- **설정:** 마우스 감도, 화면 흔들림 on/off, 이펙트 on/off, PING/FPS 표시, 닉네임. (localStorage)
- **조작법:** Vertix식 키 안내 + (후순위) 리매핑. 기본: WASD 이동 · 마우스 조준 · 클릭 발사 · R 재장전 · Q 무기전환 · 1/2/3 클래스.

---

## 5. 컴포넌트 / 씬 / 네트워크 분해

### 5.1 React (apps/web)
```
app/play/page.tsx          # 상태머신 루트(menu/connecting/playing/...)
components/menu/
  MainMenu.tsx             # 닉네임 + 클래스 + PLAY
  ServerBrowser.tsx        # 룸 리스트 + 퀵매치
  ClassPicker.tsx          # 클래스 카드(재사용)
  Settings.tsx, Controls.tsx
components/hud/
  DeathOverlay.tsx         # 사망 + 클래스 스왑 + 리스폰 카운트
  RoundEndOverlay.tsx      # 스코어보드 + 다음 라운드
  Scoreboard.tsx           # Tab 토글 전체 보드
  HudMeta.tsx              # (선택) HP/탄약/점수/타이머 DOM
game/
  PhaserGame.tsx           # room 주입받아 마운트
  net/NetProvider.tsx      # Colyseus client/room React Context
  scenes/ArenaScene.ts     # room 주입형으로 리팩터(연결 제거)
```

### 5.2 Colyseus 계약 추가/활용
- **추가:** 룸 `maxClients` + `setMetadata({mode, map})` (서버 브라우저용), `getAvailableRooms("arena")`.
- **활용(이미 있음):** `selectClass`/`switchWeapon`/`input`/`reload` 메시지, `shot`(`by`)/`kill` 이벤트, `room.state`(players/match/healthPacks).
- **불필요:** 신규 서버 메시지 거의 없음 — 대부분 클라 UI 재배치.

### 5.3 React ↔ Phaser 브릿지
- `NetProvider`가 `client`/`room` 보유. `PhaserGame`은 `room`을 prop으로 받아 `ArenaScene`에 `init(room)`로 전달.
- 오버레이는 같은 `room.state`를 **폴링/onChange**로 구독(현재 ArenaScene도 매 프레임 폴링 — 동일 패턴).
- 입력(이동/조준/발사)은 계속 Phaser가 `room.send`. 클래스 변경은 DOM 버튼/키 모두 `room.send("selectClass")`.

---

## 6. 단계별 구현 계획 (각 독립 테스트 가능)

| 단계 | 내용 | 산출 |
|------|------|------|
| U1 | **NetProvider 도입** — 연결을 React로 이전, ArenaScene을 room 주입형으로 리팩터(동작 동일) | 회귀: 기존처럼 자동 입장/플레이 |
| U2 | **메인 메뉴** — 닉네임(localStorage) + 클래스 카드 + PLAY(퀵매치). `/play`가 메뉴→게임 전환 | 메뉴에서 입장 |
| U3 | **서버 브라우저** — 룸 `maxClients`/metadata + `getAvailableRooms` 리스트 + 퀵매치/입장 | 룸 목록 표시·선택 입장 |
| U4 | **사망 오버레이** — 킬러 표시 + 클래스 스왑 + 리스폰 카운트(키 유지) | 사망 시 오버레이·클래스 변경 |
| U5 | **라운드 종료 오버레이** — DOM 스코어보드 + 다음 라운드 카운트 | 종료 시 보드·카운트 |
| U6 | **스코어보드 토글 + 설정/조작법** — Tab 보드, 감도·토글·닉네임 설정 | 설정 저장/적용 |
| U7 | **폴리시** — 킬스트릭 텍스트, 메뉴 배경, (선택) 미니맵·PING/FPS | 시각 확인 |

> U1이 토대(리팩터). 이후 U2~U7은 순차·독립. 각 단계 브랜치→PR→자동 머지.

---

## 7. 디자인 원칙 (Reboot 정체성 유지)

1. **마찰 최소화:** 첫 화면에서 클릭 1~2번 안에 교전. 로그인·튜토리얼·강제 입력 없음.
2. **즉시성 우선:** PLAY는 항상 가능(빈 룸 없으면 자동 생성). 네트워크 대기엔 명확한 "CONNECTING".
3. **단일 진실 공급원:** 클래스/무기 스탯 UI는 `@vertix/shared`에서 파생(불일치 방지).
4. **서버 권위·Top-down TPS 불변:** UI 변경은 렌더/입력 계약을 바꾸지 않음.
5. **DOM=메타, Canvas=게임:** 메뉴/오버레이는 React(선명·접근성), 게임은 Phaser(성능).
6. **점진적·가역적:** U1 리팩터가 동작을 보존, 이후 화면을 얹는다.

## 8. 명시적 비포함
계정/로그인 · 클랜 · 상점/코스메틱(Hat/Shirt/Spray/Camo) · 모드 시스템·텍스처 모드 · 사설 서버 IP/비밀번호 · HP/속도 배수 · 광고 · 영속 리더보드.

## 9. 결정 필요 항목
- [ ] 인게임 코어 HUD(HP/탄약/점수)를 **DOM로 이전**할지, Phaser 유지할지 (가독성 vs 단일 렌더)
- [ ] 서버 브라우저를 **기본 노출** vs "둘러보기" 뒤로 숨김 (즉시성 우선이면 후자)
- [ ] 닉네임 외 **지역(region)** 개념 도입 시점(다중 호스트 배포 이후)
- [ ] 채팅 포함 여부(현재 제외, 후순위)
