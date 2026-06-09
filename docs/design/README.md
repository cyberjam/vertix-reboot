# Vertix.io Reboot — 설계 문서

원본 **Vertix.io** (2016, Sidney de Vries 개발)를 현대 웹 기술로 재구현하기 위한 분석 및 설계 문서 모음입니다.

## 목표

- 원본 Vertix.io의 **게임성(feel)** 을 최대한 보존
- 단순 FPS 복제가 아닌 **Vertix.io 리부트** (탑다운 3/4 시점 슈터의 정체성 유지)
- **웹 브라우저**에서 플레이 가능 (설치 없음)

## 문서 구성

| # | 문서 | 내용 |
|---|------|------|
| 01 | [game-analysis.md](./01-game-analysis.md) | 핵심 게임 루프 / 클래스 / 무기 / 맵 / 리스폰 / 힐팩 / 점수 시스템 분석 |
| 02 | [mvp-scope.md](./02-mvp-scope.md) | MVP 범위 정의 |
| 03 | [technical-design.md](./03-technical-design.md) | 기술 설계 (Next.js + Phaser 3 + Colyseus + Supabase): 프로젝트/멀티플레이/엔티티/클래스/무기/상태동기화/DB/권위서버 |
| 04 | [milestones.md](./04-milestones.md) | 개발 마일스톤 (M1~M16, 각 1~3시간·독립 테스트·순차 개발) |
| 05 | [weapon-balance.md](./05-weapon-balance.md) | 무기 밸런스 캘리브레이션 (연사/재장전/사거리 확정, TTK 모델, 불변식) |
| 06 | [ui-ux-plan.md](./06-ui-ux-plan.md) | UI/UX 개선안 (Vertix 흡수: 메인 메뉴 / 서버 브라우저 / 클래스 선택 / 리스폰 루프) |
| 07 | [map-cow.md](./07-map-cow.md) | Cow Map — 첫 테마 맵 (치수 / 스폰 / 힐팩 / 교전 구역 / 가정). 원본 에셋·데이터 미사용 [설계 결정] |

## ⚠️ 자료 출처 및 신뢰도에 관한 중요한 고지

**이 저장소에는 별도로 첨부된 Vertix.io 자료가 존재하지 않았습니다.** (작업 시작 시점에 저장소는 비어 있었음.)

따라서 본 문서는 다음을 기반으로 **재구성(reconstruction)** 되었습니다.

1. 공개 위키 및 게임 정보 사이트 (Vertix.io Fandom Wiki, TV Tropes, Giant Bomb 등)
2. 위 자료에 명시된 정량 데이터 (HP, 데미지, 탄창 수 등)
3. 명시되지 않은 부분에 대한 **합리적 역추론(reverse-engineering)**

신뢰도를 구분하기 위해 문서 내에서 다음 태그를 사용합니다.

- **[확인됨]** — 공개 자료에 명시된 사실
- **[추정]** — 자료에 단편적으로 언급되었거나, 게임 구조상 합리적으로 추론한 내용
- **[설계 결정]** — 리부트에서 우리가 새로 정하는 사항 (원본과 다를 수 있음)

> 원본 자료(클라이언트 코드, 스프라이트, 밸런스 시트, 영상 등)를 첨부해 주시면,
> 추정 항목을 확인된 수치로 교체하여 문서를 갱신하겠습니다.

## 참고 출처

- [Vertix.io — TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Vertixio)
- [Vertix.io Wikia — Classes / Game Modes / 각 클래스 페이지 (Fandom)](https://vertixio.fandom.com/wiki/Vertix.io_Wiki)
- [Vertix io — Giant Bomb](https://giantbomb.com/wiki/Games/Vertix_io)
- [Vertix Online — namu.wiki](https://en.namu.wiki/w/vertix.io)
