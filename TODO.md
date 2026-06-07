# TODO

> 실제 구현과 대조해 표기. 상세: [PROJECT_STATE.md](./PROJECT_STATE.md) · [docs/design/06-ui-ux-plan.md](./docs/design/06-ui-ux-plan.md)

## 완료 (Done)

**코어:** 이동(서버 권위 + 예측/재조정) · 히트스캔 사격(벽/LOS) · HP/사망/리스폰 · 헬스팩 ·
클래스 3종/무기 4종 · FFA 점수·라운드 루프 · 점프(Space, 홀드 시 자동 재점프)

**UX/UI:** 진입점 `/` 풀스크린 메인 메뉴(닉네임+클래스 카드) · 서버 브라우저(퀵매치/룸 리스트) ·
React DOM HUD(체력/탄약/타이머/리더보드/킬피드) · 미니맵 · 사망 오버레이(킬러·클래스 스왑·카운트) ·
라운드 종료 오버레이 · 전체 스코어보드(Shift) · 설정/조작법 · 연결을 React(`NetProvider`)로 이전

**배포 설정(`master`):** `/health`+CORS · `Dockerfile`/`.dockerignore` · `render.yaml` · `.env.example` · `docs/DEPLOY.md`

## 진행 중 / 다음 (P0)

- [ ] **공개 호스팅** — 배포 설정을 `dev`로 동기화(master→dev) 후 실제 배포: game-server(Render/Docker), web(Vercel). 가이드 `docs/DEPLOY.md`.

## 예정 (Planned)

- [ ] **콘텐츠** — 추가 클래스/무기(Detective 등), 추가 모드(TDM/Hardpoint)
- [ ] **폴리시** — 사운드 SFX, 킬스트릭 텍스트, 키 리매핑, PING/FPS 표시, 채팅
- [ ] **테스트** — 스모크 테스트를 정식 러너(vitest 등)로 영속화

## 범위 외 (구현 안 함)

계정/로그인 · 클랜 · 상점/코스메틱 · 모드(텍스처) 시스템 · 사설 서버
