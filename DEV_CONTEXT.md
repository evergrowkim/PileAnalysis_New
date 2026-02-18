# GeoAI 말뚝 기초 설계 계산기 — 개발 컨텍스트

> 이 문서는 향후 세션에서 빠르게 컨텍스트를 복원하기 위한 개발 기록이다.
> 마지막 업데이트: 2026-02-18 (v2.3)

---

## 1. 프로젝트 개요

- **단일 파일 웹앱**: `index.html` (약 5,000줄)
- **기능**: 말뚝(PHC/강관) 기초의 수직지지력, 수평지지력, 인발, 침하 계산
- **기준**: KDS 11 50 40, 도로교설계기준(2008), Meyerhof/암반근입 공법
- **입력**: 시추공 JSON (drill_log) 업로드 → 다수 시추공 일괄 계산
- **AI 기능**: Claude API (Haiku 4.5) 연동 4가지 기능

---

## 2. 파일 구조

```
index.html          — 전체 앱 (HTML + CSS + JS, 단일 파일)
lateral_pile_capacity_guide.md  — 수평지지력 계산 가이드 (개발 참조용)
DEV_CONTEXT.md      — 이 파일 (개발 컨텍스트)
geoai_result_*.json — 테스트용 시추공 데이터 (18공)
```

---

## 3. 핵심 전역 상태 (STATE 객체)

```javascript
STATE = {
  // 말뚝 제원
  pileType: 'PHC' | '강관',
  diameter_mm, thickness_mm, phcGrade: 'A'|'B'|'C',
  bearingMethod: 'meyerhof' | 'rock',

  // EL/지반
  pileTopEL: 130, groundEL, bearingEL, gwlDepth,
  embedDepth: 1,  // 근입 깊이 (m)

  // 성토/절토
  useFill: false, plannedEL, fillN,

  // 시추공 데이터
  sptData: [{depth, N, remark}],
  layers: [{soilType, thickness, depthFrom, depthTo, avgN}],
  boreholeNo: 'NBH-03',

  // 다수 시추공
  uploadedData: [bh, bh, ...],  // 각 bh에 holeNo, groundEL, gwlDepth, sptData, layers, bearingEL
  currentBhIdx: 0,

  // 계산 결과
  result: calcPile() 반환값,

  // AI 관련
  sigmaMax, alpha_kh, delta_cm, corrosionThk,
  qu_kPa, Sd_m, td_m, rockPhi, jointCount, jointType
}
```

**BH_RESULTS**: `{holeNo: calcPile() 결과}` — 전체 시추공 계산 결과 캐시

---

## 4. 핵심 함수 맵

### 계산 엔진
| 함수 | 위치(약) | 역할 |
|------|----------|------|
| `calcPile(params)` | ~200 | 단일 시추공 전체 계산 (Qa, Ha, 침하 등) |
| `recalculate()` | ~893 | STATE 기반 재계산 → saveCurrentToUploadedData → renderAllTabs |
| `calcAllBoreholes()` | ~3732 | 모든 시추공 일괄 계산 → BH_RESULTS 갱신 |

### 시추공 관리
| 함수 | 위치(약) | 역할 |
|------|----------|------|
| `applyBoreholeData(bh, idx)` | ~1069 | 시추공 전환 시 STATE에 데이터 적용 (bearingEL 포함) |
| `saveCurrentToUploadedData()` | ~1059 | 현재 STATE를 uploadedData[currentBhIdx]에 저장 (bearingEL 포함) |
| `selectBorehole(idx)` | ~2577 | 시추공 선택 UI 핸들러 |
| `processJSON(text, filename)` | ~2567 | JSON 파싱 → uploadedData 설정 |

### 자동 탐지
| 함수 | 위치(약) | 역할 |
|------|----------|------|
| `autoDetectBearingLayer()` | ~2473 | 현재 시추공의 지지층 EL 자동 탐지 (SPT remark/N값) |
| `autoDetectBearingAllBoreholes()` | ~1547 | 모든 시추공 지지층 EL 일괄 자동 탐지 |

### AI 기능
| 함수 | 위치(약) | 역할 |
|------|----------|------|
| `parseNLInput()` | ~1400 | AI 자연어 입력 파싱 (Claude API 호출) |
| `showNLPreview()` | ~1475 | AI 파싱 결과 미리보기 (파라미터 + 액션 배지) |
| `applyNLParsed()` | ~1522 | 파싱된 결과 적용 (파라미터 → 액션 실행) |
| `sendChatMessage()` | 채팅 관련 | AI 채팅 메시지 전송 (스트리밍) |
| `prepareChatContext()` | 채팅 관련 | 채팅용 시추공+계산 데이터 컨텍스트 준비 |
| AI 시추공 분석 | Feature A | 전체 시추공 데이터 AI 분석 |
| AI 검토 | Feature B | 설계 적정성 AI 검토 |

### 렌더링
| 함수 | 역할 |
|------|------|
| `renderAllTabs()` | 전체 탭 렌더링 |
| `renderInputTab()` | 입력 탭 (설계제원, SPT, 지층) |
| `renderVerticalTab()` | 수직지지력 탭 |
| `renderLateralTab()` | 수평지지력 탭 |
| `renderPulloutTab()` | 인발 탭 |
| `renderSettlementTab()` | 침하 탭 |
| `renderSummaryTab()` | 요약 탭 |
| `renderReportTab()` | 상세보고서 탭 |
| `renderOverallTab()` | 종합결과 탭 (다수 시추공 비교 + 물량 산정) |

---

## 5. AI NL Parser 시스템

### 구조
1. 사용자가 자연어 입력 (예: "PHC 500mm B종, 암반 지지, 근입깊이 2m")
2. `parseNLInput()` → Claude API → JSON 반환 (파라미터 + actions)
3. `showNLPreview()` → 미리보기 UI (파라미터 변경 카드 + 액션 배지)
4. `applyNLParsed()` → STATE 업데이트 → 액션 실행

### 지원 액션
```javascript
"actions": ["autoDetectBearing", "autoDetectBearingAll"]
```
- `autoDetectBearing`: 현재 시추공 지지층 EL 자동 탐지
- `autoDetectBearingAll`: 모든 시추공 지지층 EL 일괄 자동 탐지

### NL 파서 프롬프트 위치
- 시스템 프롬프트: `parseNLInput()` 함수 내부 (~1400줄)

---

## 6. 물량 산정 (Quantity Estimation)

### 함수
- `calcQuantities()` — renderOverallTab() 직전 위치
- `renderQuantitySection(q, isMulti)` — 물량 산정 UI 렌더링

### 계산 항목
| 항목 | 계산식 | 단위 |
|------|--------|------|
| 말뚝 중량 | `W_unit × pileLength / 9.80665` | ton |
| 재료 체적 | `Ap_net × pileLength` | m³ |
| 표면적 | `U × pileLength` | m² |

### UI 구성
- 4열 카드 그리드: 총 본수, 총 길이, 총 중량(ton), 총 체적(m³)
- 추가 카드: 평균/최장/최단 길이, 총 표면적
- `<details>` 접기/펼치기: 시추공별 물량 상세 테이블

---

## 7. 개별 시추공 bearingEL 시스템

### 동작 원리
각 시추공은 개별 `bh.bearingEL`을 가질 수 있음 (없으면 공유 STATE.bearingEL 사용).

### 데이터 흐름
```
autoDetectBearingAllBoreholes()
  → 각 bh.bearingEL 설정 (15/18 성공, 3 실패=fallback)
  → STATE.bearingEL = 현재 시추공의 bearingEL
  → recalculate()
    → calcPile(STATE) — 현재 시추공 계산
    → saveCurrentToUploadedData() — bearingEL 포함 저장
    → renderAllTabs() — UI 갱신

selectBorehole(idx)
  → saveCurrentToUploadedData() — 현재 bh에 bearingEL 저장
  → applyBoreholeData(bh, idx) — STATE.bearingEL = bh.bearingEL 복원
  → recalculate()

calcAllBoreholes()
  → bearingEL: bh.bearingEL || STATE.bearingEL  (개별 우선)
```

### 유효성 검증
- `tipEL = bearingEL - embedDepth` 가 `pileTopEL`보다 낮아야 유효
- 무효 시 bh.bearingEL 미설정 → 공유 STATE.bearingEL 사용

---

## 8. AI 캐시 시스템

- `AI_CACHE` 객체: Feature별 결과 캐시
- `AI_CACHE_KEY`: STATE 주요 파라미터 기반 해시
- `invalidateAICache()`: recalculate() 시 호출 → 입력 변경 시 캐시 무효화

---

## 9. 버전 히스토리

| 버전 | 커밋 | 주요 변경 |
|------|------|-----------|
| v2.0 | bce6cda | 전면 업데이트 (기본 기능 완성) |
| v2.1 | e31116f | 근입 깊이 추가, 버그 수정 대규모 업데이트 |
| v2.2 | 9e45583 | 수평지지력 가이드 기준 전면 수정, 성토층 EL 버그 수정 |
| v2.3 | (현재) | AI 기능 4종 추가, AI 채팅, 물량 산정, 개별 bearingEL, NL 액션 시스템 |

### v2.3 변경사항 상세
1. **Claude API 연동 (Haiku 4.5)**
   - AI 자연어 입력 → 설계 파라미터 자동 적용
   - AI 시추공 분석 (Feature A)
   - AI 설계 검토 (Feature B)
   - AI 채팅 (지반공학 전문가 모드, 스트리밍)
2. **AI NL 액션 시스템**: `autoDetectBearing`, `autoDetectBearingAll`
3. **물량 산정**: 종합결과 탭에 물량 카드 + 시추공별 상세 테이블
4. **개별 bearingEL**: 시추공별 지지층 EL 개별 관리 (save/restore/calcAll 연동)
5. **AI 캐시**: 반복 호출 방지
6. **절토 로직**: useFill에 절토 시나리오 포함

---

## 10. 알려진 제한사항 / 향후 개선 후보

- [ ] NBH-1, NBH-2 등 groundEL이 pileTopEL보다 높은 시추공은 자동 탐지 실패 → 사용자 수동 입력 필요
- [ ] 물량 산정에 말뚝 본수(nPiles) 입력 미지원 (현재 1본/공 가정)
- [ ] AI 자연어 입력에 더 많은 액션 추가 가능 (예: 말뚝 종류 변경 후 전체 재계산)
- [ ] 종합결과 탭에 bearingEL별 분포 차트 추가 가능
- [ ] 엑셀 내보내기에 개별 bearingEL 컬럼 추가 필요
- [ ] AI 채팅에 이미지/차트 첨부 기능

---

## 11. 개발 환경

```bash
# 로컬 서버 실행
cd "/Users/youngtaekim/Downloads/NewPile (2)"
python3 -m http.server 8877

# 브라우저에서 열기
http://localhost:8877/index.html

# 테스트 데이터
geoai_result_2026-02-15.json  (18개 시추공)
```

---

## 12. 빠른 코드 탐색 가이드

```
~200    : calcPile() — 핵심 계산 엔진
~893    : recalculate() — STATE 기반 재계산
~1059   : saveCurrentToUploadedData() — 시추공 데이터 저장
~1069   : applyBoreholeData() — 시추공 전환
~1400   : AI NL 파서 (parseNLInput, showNLPreview, applyNLParsed)
~1547   : autoDetectBearingAllBoreholes() — 일괄 자동 탐지
~2200   : renderInputTab() — 입력 탭 렌더링
~2473   : autoDetectBearingLayer() — 단일 시추공 자동 탐지
~2550   : 파일 업로드 핸들러
~3732   : calcAllBoreholes() — 전체 시추공 일괄 계산
~3800   : renderOverallTab() — 종합결과 탭 (물량 산정 포함)
~4500+  : AI 채팅 시스템
```
