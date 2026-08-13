# 공정·출하 검증 대시보드

**Capstone 트랙**: 트랙 A — 풀스택 웹앱
**구현에 쓸 수 있는 시간**: 실질 6~8시간

## 진행 상황

- ✅ **Phase 1 완료** (Excel Parser + 정합성 검증): 5종 파일 모두 헤더/구조로 자동 판별 성공(파일명 무관), 컬럼은 헤더 이름으로 매핑(열 순서 바꾼 테스트 통과), 정합성 검증 규칙 6종 모두 자동 테스트 통과(vitest 11/11), 브라우저에서 실제 5개 파일 업로드로 최종 확인 완료(9개 Config, Daily Plan 135행, 공정 status 306건, 검증 위반 0건). 코드 위치: `process-dashboard/lib/`, 테스트: `process-dashboard/tests/parse.test.ts`.
- ✅ **Phase 2 완료** (수율 이상점 탐지 + 목표 수율 입력): 가상데이터 기준 Config 2·4의 Process 7·11이 위험(빨강)으로 정확히 표시됨(Config 2·4의 Process 15도 93.0%/90.0%로 주의 표시 — 문서에 없던 항목이지만 계산상 정상 결과). 화면에서 Process별 목표 수율 입력 시 기준 수율이 즉시 재계산되고, 0~100 범위 밖 값(예: 150)은 저장이 거부되고 오류 문구가 표시됨을 브라우저에서 실제로 확인. 위험/주의 절대·상대 임계값 4개 모두 화면에서 조정 가능. 자동 테스트 20/20 통과. 코드 위치: `process-dashboard/lib/yieldAnalysis.ts`, 테스트: `process-dashboard/tests/yieldAnalysis.test.ts`.
  - 참고(발견, 고치지 않음): 원본 문서의 기본 임계값(90%/97%, 10%p/5%p)은 수율이 100%를 넘을 수 없다는 제약 때문에, "기준수율 대비 %p" 조건이 "절대 %" 조건보다 더 엄격하게 작동하는 경우가 실질적으로 없음(기준수율이 100%여도 절대 위험선 90%까지 최대 갭이 10%p라 항상 절대조건과 동시에 걸림). 목표 수율을 매우 높게 입력해도 이 특성은 동일함 — 화면에서 임계값을 직접 조정할 수 있으니 실사용에 문제는 없음.
- ✅ **Phase 3 완료** (일정편차 + 지연 알람, 사용자 피드백 반영해 1차 설계에서 재설계함): 처음엔 Config×Process 전체 매트릭스로 만들었는데, 사용자가 원한 건 그게 아니라 "특정 시점 기준 각 Config가 지금 어느 Process에 대기 중인지 + 그게 Daily Plan 대비 며칠 차이인지"였음. Line별로 구분(Line 1 / Line 2)한 뒤 그 아래 Config를 배치하고, 화면에서 기준 시점(날짜+9AM/6PM)을 선택하면 각 Config의 "현재 대기 Process"(Input은 있지만 Output이 아직 없는 가장 앞선 Process)와 Daily Plan 계획일 대비 며칠 차이나는지(지연/선행/계획준수/완료)를 한 줄씩 보여주는 구조로 다시 만듦. 지연일수 임계값(기본 주의 2일/위험 3일)은 화면에서 조정 가능. 2026-08-13 9AM 기준 실제 값(예: Config 3 process 11 계획준수, Config 2는 process 15까지 가서 2일 선행)을 브라우저에서 직접 확인. 자동 테스트 27/27 통과. 코드 위치: `process-dashboard/lib/currentStatus.ts`, 테스트: `process-dashboard/tests/currentStatus.test.ts`. (기존 Config×Process 전체 매트릭스 방식의 `computeScheduleCells`와 그 테스트는 사용자 피드백에 따라 삭제함 — `scheduleAnalysis.ts`엔 이제 임계값 타입만 남음)
  - 추가 피드백 반영: 기준 시점을 날짜/시간 드롭다운 2개로 분리(기존엔 "날짜 시간" 합쳐진 드롭다운 1개)했고, 아직 시작 안 한 Config(Input조차 없음)는 표에서 해당 행을 빈칸으로 표시(이전엔 "process 1"/"미착수"로 채워서 보여줬음). 2026-08-04 9AM 기준으로 Config 1만 process 1에서 시작했고 나머지는 빈칸으로 뜨는 것을 브라우저에서 확인.
- ✅ **(범위 외 추가 요청) Yield/NG Analysis·Process Dashboard Excel 다운로드**: 원래 "되면 좋은" 항목이었던 "분석 결과 Excel 다운로드"를 사용자 요청으로 두 화면에 한해 먼저 구현. ExcelJS로 각 화면의 데이터를 셀 단위로 쓰고(수율표는 Config×Process 숫자 셀 + 위험/주의 배경색, Process Dashboard는 Line/Config/현재Process/상태/계획일/지연일수/알람을 각각 별도 셀로), 위험/주의 셀은 배경색도 함께 적용. **셀 단위 반영 여부는 자동 테스트(vitest 5개, ExcelJS로 다시 읽어서 특정 셀 좌표의 값·색상을 직접 검증)로 확인했고, 브라우저에서 실제로 다운로드한 파일을 다시 열어(Node에서 ExcelJS로 재확인) Config 2의 Process 7 셀이 79.5와 위험색으로 정확히 들어있는 것까지 확인**. 코드 위치: `process-dashboard/lib/exportExcel.ts`, 테스트: `process-dashboard/tests/exportExcel.test.ts`.
- ✅ **(범위 외 추가 요청) Process Dashboard 신호등 컬럼**: 화면·Excel 다운로드 둘 다에 추가. 기존 조정 가능한 주의/위험 임계값과는 별개로 고정 규칙(지연 0일 이하=Green, 1일=Yellow, 2일 이상=Red, 완료=Green, 미착수=빈칸)으로 동작. 2026-08-09 9AM 기준 Config 7·9(지연 +1일)가 노란 점으로, 나머지는 초록 점으로 뜨는 것을 브라우저에서 확인. 자동 테스트 5개 추가(37/37 전체 통과).
- ✅ **Phase 4 완료** (출하 부족 Risk 판정): 가상데이터 기준 Config 2·4가 정확히 "Waiver Dependent"로(현재양품 800/900, 예상최종양품 800/900, 출하계획 1000/1200, 승인Waiver 200/300, 부족분 200/300), 나머지 7개 Config는 모두 "OK"로 표시됨을 브라우저에서 확인. 예상 최종 양품 = 현재 양품 × 남은 Process들의 기준 수율(Phase2의 목표수율/자동계산 그대로 재사용)로 계산. 자동 테스트 8개 추가(45/45 전체 통과). 코드 위치: `process-dashboard/lib/shipmentRisk.ts`, 테스트: `process-dashboard/tests/shipmentRisk.test.ts`.
  - **결정 사항(원본 문서에 명확한 기준이 없어 직접 정함)**: "OK/Risk/Waiver Dependent/Shortage" 4단계 중 "Risk"의 정확한 판정 기준이 원본 문서에 없었음. 부족분이 있는데 승인된 Waiver NG가 0인 경우를 "Risk"(아직 Waiver 신청/승인 전이라 확정 판단 불가, 조사 필요)로, Waiver가 있고 그걸로 충족되면 "Waiver Dependent", 그래도 부족하면 "Shortage"로 정의함. 가상데이터엔 "Risk" 사례가 없어 합성 테스트로만 검증함 — **1:1 코칭에서 확인이 필요한 항목**.
- ✅ **Phase 5 완료** (출하 D-1 초안 생성): Process Dashboard와 기준 시점(날짜+시간)을 공유해서, 그 다음 날 출하 예정인 Config들의 Destination별 OK/Waiver 배정 초안을 만듦. Config 2를 2026-08-14 6PM 기준으로 조회하면 출하일 2026-08-15에 OK 800/Waiver 200이 계산되고, 기본 우선순위(1,2,3,4)로 배정한 결과가 D1:600/0, D2:150/0, D3:50/50, D4:0/150 — 모든 Destination 합계가 계획 수량과 정확히 일치함을 브라우저에서 확인. Destination 4를 우선순위 맨 위로 옮기자 배정이 D1:500/100, D2:150/0, D3:0/100, D4:150/0으로 즉시 재계산되는 것도 확인. Config 4(2026-08-16 기준, 출하일 08-17)도 동일하게 검증됨. 자동 테스트 7개 추가(52/52 전체 통과). 코드 위치: `process-dashboard/lib/shipmentDraft.ts`, 테스트: `process-dashboard/tests/shipmentDraft.test.ts`.
  - **흥미로운 발견(버그 아님)**: 원본 문서가 권장하는 "출하일 전날 오전 9시" 그대로 Config 2를 조회하면(2026-08-14 9AM) 예상 최종 양품이 800이 아니라 약 850.5로 나옴 — 이유는 그 시점엔 Config 2의 마지막 Process(15)가 아직 진행 중(Output 미확정)이라, 예상치가 Config 2 자신의 실제 낮은 수율이 아니라 전체 Config 평균 기준수율(약 98.9%)로 계산되기 때문. 그날 오후 6시(같은 날, Process 15 완료 후)에 다시 조회하면 정확히 800이 나옴. 계산식 자체는 맞고, "예상치는 아직 안 끝난 Process가 있으면 실제와 다를 수 있다"는 자연스러운 특성으로 판단해 그대로 둠 — 화면에서 기준 시점을 자유롭게 선택할 수 있으니 실사용에 문제없음.
- 🐛 **버그 발견·수정: 날짜가 전부 하루씩 밀려 표시됨** — Phase 5 준비 중 Config 2·4의 계획 출하일/Waiver 출하일을 원본 문서 예시(8/15,8/17 / 8/17,8/18)와 대조하다가, 지금까지 화면에 표시된 모든 날짜가 실제보다 하루 이르게 나오고 있었다는 걸 발견함(공정 status 스냅샷도 "8/4~8/20"으로 떴는데 원본 문서는 "8/5~8/21"). 원인은 엑셀 날짜 셀을 JS Date로 변환할 때(SheetJS cellDates) 정확히 자정이 아니라 자정 몇 시간 전(UTC 기준 14:59:08 등)으로 변환되는 현상 때문에, 그 시각을 그대로 날짜로 잘라내면 하루 전 날짜가 나왔던 것. 날짜를 자르지 않고 가장 가까운 UTC 자정으로 반올림하도록 고쳐서 4개 예시 날짜가 전부 원본 문서와 정확히 일치하게 됨. **이 버그는 Phase 1~4 계산 결과 자체(지연일수, 승인여부 등 상대 비교)에는 영향이 없었음**(같은 방식으로 변환된 날짜끼리 빼는 계산이라 하루씩 밀린 게 서로 상쇄됨) — 화면에 "보여지는" 절대 날짜만 하루 틀리게 나오고 있었음. Phase 3(Process Dashboard 날짜 드롭다운·계획일 표시)과 Phase 5(다음날 출하 대상 판단)에 실질적 영향이 있어 지금 고침. 수정 위치: `process-dashboard/lib/excelIO.ts`. 관련 테스트의 하드코딩된 날짜도 전부 +1일로 맞춰 갱신, 45/45 계속 통과.
- ✅ **(범위 외 추가 요청) Shipment Risk·Shipment Draft도 날짜별로 조회 가능하게 함**: 원래 Shipment Risk는 항상 최신 데이터만 보여줬는데, Process Dashboard와 같은 기준 시점(날짜+시간) 선택 상태를 공유하도록 바꿔서 세 섹션(Process Dashboard / Shipment Risk / Shipment Draft) 모두 같은 시점 기준으로 동기화되게 함. 2026-08-12 9AM으로 바꾸면 세 섹션이 동시에 그 시점 기준으로 갱신되고, Shipment Risk에서 Config 2·4가(아직 이상이 다 드러나지 않은 이른 시점이라) "OK"로 뜨는 것도 확인 — 최신 시점에서 "Waiver Dependent"였던 것과 달리, Risk 판정도 시점에 따라 달라진다는 걸 보여줌(버그 아님, 예측이 시간에 따라 정교해지는 자연스러운 특성). 자동 테스트 1개 추가(53/53 전체 통과). 코드 위치: `process-dashboard/lib/shipmentRisk.ts`(atSnapshot 파라미터 추가), `process-dashboard/app/page.tsx`(SnapshotPicker 공용 컴포넌트로 3곳에 재사용).
- ✅ **Phase 6 완료** (대시보드 통합): 상단에 sticky 메뉴 바(Upload Center / Yield·NG Analysis / Process Dashboard / Shipment Risk / Shipment Draft)를 추가해 각 섹션으로 바로 이동 가능. 업로드 결과(파싱된 5개 파일 데이터)를 localStorage에 저장해서, **브라우저를 새로고침해도 파일을 다시 올릴 필요 없이 모든 화면(수율표·Process Dashboard·Risk·Draft)이 그대로 유지됨을 실제로 새로고침해서 확인**. "마지막 업로드 저장: 일시" 표시도 추가. 자동 테스트 4개 추가(57/57 전체 통과, 브라우저 전용 기능이라 localStorage는 메모리 목으로 테스트). `npm run build`는 이번엔 dev 서버가 `.next` 폴더를 물고 있어 일시적 EPERM으로 실패했지만 tsc/vitest/eslint는 모두 통과했고 실제 브라우저 동작으로 확인함. 코드 위치: `process-dashboard/lib/persistence.ts`, `process-dashboard/app/page.tsx`.

**PLAN.md 문서에 정의된 6개 Phase 모두 완료.** "되면 좋은" 3개 항목(출하 수정 이력, NG Material 원인분석, Excel 다운로드 — 이 중 Yield/Process Dashboard 2개는 이미 만듦)은 이번 세션에서 다루지 않기로 한 대로 남겨둠.
- ✅ **(범위 외 추가 요청) 전체 디자인 개선**: 인라인 스타일 위주였던 화면을 globals.css 중심의 디자인 시스템으로 정리(색상·간격·타이포그래피 변수, 카드형 섹션, 고정 상단 메뉴, 다듬어진 표/버튼/입력창 스타일, 부드러운 상태 배경색, 다크모드 대응). 로직/계산 코드는 손대지 않고 화면만 개선. tsc/vitest(57/57)/eslint 모두 통과, 브라우저에서 확인. 코드 위치: `process-dashboard/app/globals.css`, `process-dashboard/app/page.tsx`.
- ✅ **(범위 외 추가 요청) Shipment Risk·Shipment Draft Excel 다운로드**: 나머지 세 화면(Upload Center 제외 전부)에 Excel 다운로드 완비. Shipment Risk는 Config별 판정 행에 색을 입혀서, Shipment Draft는 Config별 블록(제목+Destination표)을 시트 하나에 순서대로 기록. 자동 테스트 3개 추가(60/60 전체 통과, 셀 좌표 직접 검증) + 브라우저에서 실제 다운로드해 ExcelJS로 재확인.
- ⚠️→✅ **("되면 좋은" 항목, 1차 구현이 요구사항과 달라 재구현) Shipment Progress — 출하 계획 대비 진행률**: 처음엔 "출하 수정 이력"을 업로드 간 변경분 diff(신규/수정/삭제 로그)로 만들었는데, 사용자 피드백은 그게 아니라 "Config·Destination별 계획 수량과 기준 시점까지 실제 출하 완료된 수량을 같은 표에서 비교해서 남은 필요 수량·목적지를 보고 싶다"는 것이었음. diff 방식(`shipmentHistory.ts`, `recordUpload` 누적 저장)은 전부 삭제하고, Config별 출하 Plan(계획 수량)과 Config 출하 테이블(실제 출하 기록)을 Config+Destination 기준으로 매칭해 계획/누적 출하/잔여 수량을 계산하고, Destination별로 날짜순 출하 기록(날짜·해당일 수량·누적·Sample Status)까지 한 표 안에 같이 보여주는 `shipmentProgress.ts`로 재구현. 화면 상단 기준시점(날짜+시간)의 날짜 이하 기록만 "완료된 출하"로 집계(사용자 확인 완료). diff 관련 테스트 9개 삭제 + progress 관련 테스트 6개 추가로 총 66/66 통과. **브라우저에서 검증**: 기준 시점을 8/21로 두면 Config 1~4 모두 계획 100% 충족(Config 2의 Destination 3는 OK 50 + Waiver NG 50이 합쳐져 계획 100 충족되는 것까지 확인), 기준 시점을 8/15로 당기면 8/13에 출하된 Config 1만 완료로 남고 나머지는 출하 완료 0/잔여 전량으로 정확히 바뀌는 것 확인. 코드 위치: `process-dashboard/lib/shipmentProgress.ts`, 테스트: `process-dashboard/tests/shipmentProgress.test.ts`. 탭 이름도 "Shipment History"에서 "Shipment Progress"로 변경.
- ✅ **(범위 외 추가 요청) 상단 메뉴를 스크롤형 앵커 링크에서 탭 전환 방식으로 변경**: 6개 섹션(Upload Center/Yield·NG Analysis/Process Dashboard/Shipment Risk/Shipment Draft/Shipment Progress)이 한 페이지에 세로로 모두 쌓여 있던 걸, 탭을 클릭하면 그 섹션만 보이는 방식으로 바꿈(마지막 섹션을 다른 섹션들과 분리해서 보고 싶다는 피드백 반영, 탭 방식이 전체 화면 일관성상 낫다고 판단해 6개 섹션 전체에 적용). 각 섹션의 상태(스냅샷 선택, 임계값 입력 등)는 탭을 벗어나도 유지됨(조건부 렌더링만 하고 언마운트해도 상위 state가 값을 들고 있음). tsc/eslint/vitest 모두 통과, 브라우저에서 탭 전환 확인. 코드 위치: `process-dashboard/app/page.tsx`(TABS 배열 + activeTab state), `process-dashboard/app/globals.css`(.topnav button 스타일).
- ✅ **(범위 외 추가 요청) Shipment Progress를 Config별 블록 표에서 전체를 한 표로 보는 단일 필터형 표로 재구성**: Config마다 별도 블록으로 나뉘어 있던 걸 "Config를 1열로 두고 전체를 한 번에" 보이는 하나의 표로 합쳤고, 모든 컬럼(Config/Destination/계획 수량/날짜/해당일 출하 수량/누적 출하/잔여 수량/Sample Status) 헤더에 엑셀 자동 필터처럼 체크박스로 값을 선택/해제하는 드롭다운을 추가함(전체 선택·전체 해제 버튼 포함, 여러 컬럼에 동시에 필터를 걸면 AND 조건으로 좁혀짐). 브라우저에서 Config 필터로 Config 8만 체크 해제 → 나머지 8개 Config 행만 남는 것, 전체 선택으로 9개 Config 모두 복원되는 것 확인. tsc/eslint/vitest(68/68) 모두 통과. 코드 위치: `process-dashboard/lib/shipmentProgress.ts`(flattenShipmentProgress 추가), `process-dashboard/app/page.tsx`(useColumnFilters 훅 + FilterableColumnHeader 컴포넌트, 범용적으로 만들어 다른 표에도 재사용 가능), `process-dashboard/app/globals.css`(.col-filter-* 스타일).
- ✅ **(범위 외 추가 요청) Shipment Progress에 완료·문제 상태 시각적 강조 추가**: "완료된 것/문제있는 것이 눈에 더 잘 보이게" 요청에 따라, 행별로 상태를 판정해 배경색 + 상태 배지(완료/확인 필요/진행 중)로 표시. 완료 기준(잔여 수량 0)은 명확해서 바로 적용했고, "문제" 기준은 1:1 코칭 대신 미리 확인 질문으로 물어봄 — 사용자가 "초과 출하(잔여 수량 음수)"와 "승인 안 된 Waiver NG 출하" 둘 다 선택. 수량은 다 채워졌어도 미승인 Waiver가 있으면 "문제"가 "완료"보다 우선하도록 판정 순서를 정함. Sample Status 옆에 Waiver Status 컬럼도 새로 노출(그래야 왜 빨간색인지 화면에서 바로 보임). 자동 테스트 9개 추가(75/75 전체 통과, 우선순위 케이스 포함). 코드 위치: `process-dashboard/lib/shipmentProgress.ts`(classifyShipmentProgressRow), `process-dashboard/app/page.tsx`, `process-dashboard/app/globals.css`(.status-pill-*).

## ① 문제 정의 — 지금 무엇이 불편한가

- **누가 / 언제 / 어떤 일에서**:
  출하 담당자가 매일 아침(필수) + 시간 되면 오후(선택) 총 1~2회, 공정 진행 현황을 보고 출하 수량 부족 여부를 미리 판단한다.
  추가로 매일 아침, Daily Plan 대비 각 Config의 Process별 일정이 어떻게 되고 있는지(일정 편차)도 확인해서 보고해야 한다.
- **줄이는 비용**: 검증 비용
  (수율 이상·정합성 오류·양품 부족·일정 편차를 사람이 눈으로 판단 → 기계가 판정)
- **지금 걸리는 시간·횟수**:
  1회당 약 10분 (원본 가상데이터 외에 원인 분석용 다른 데이터까지 함께 봐야 해서), 하루 1~2회

## ② AI 에이전트에게 맡길 부분

- **에이전트가 대신할 일**: Excel Parser, 정합성 검증 로직, 공정 분석 엔진(수율이상점·목표수율입력·일정편차+지연 알람), 출하 Risk 판정, 출하 D-1 초안 생성 로직(Destination 우선순위 설정 포함)까지 구현 전부.
- **사람이 계속 할 일**: 수율 위험/주의 기준값·Risk 판정 규칙 등 업무 규칙 확정, 가상데이터 기준 결과(Config 2·4 사례)가 맞는지 검증자로서 확인, Phase별 진행 승인.
- **쓸 도구**: 별도 서브에이전트·MCP·hook 없이 단일 세션에서 Phase 순서대로 구현. Phase1(Parser) 완료 후 자동 테스트로 가상데이터 정합성 검증 케이스 통과 확인.

## ③ 범위 — 반드시 / 되면 좋은 / 안 하는 것

- **반드시 (이게 안 되면 실패)**:
  1. 5개 Excel 업로드 + 정합성 자동검증 (Config 일치, Shipment Qty=Total Shipment=OK+Waiver, Destination 합계=Total Shipment, Input=Output+NG 등), 컬럼은 위치가 아니라 헤더 이름으로 매핑
  2. Process별 수율 이상점 자동탐지 (화면에서 Process별 목표 수율 입력 가능 — 입력 시 그 값을 기준 수율로 사용, 미입력 Process는 자동계산 값 사용, 0~100% 범위를 벗어나거나 숫자가 아닌 입력은 거부하고 오류 표시). 위험/주의를 가르는 절대 임계값(기본 90%/97%, 기준수율 대비 10%p/5%p)도 화면에서 조정 가능
  3. Daily Plan 대비 일정편차 표시 — 화면에서 기준 시점(날짜+9AM/6PM)을 선택하면 Line별로 묶인 Config마다 "현재 대기 Process"와 Daily Plan 계획일 대비 며칠 차이나는지(지연/선행/계획준수/완료)를 표시. 지연일수 2일 이상이면 주의, 3일 이상이면 위험으로 알람 표시
  4. 출하 부족 Risk 판정 (OK/Risk/Waiver Dependent/Shortage)
  5. 출하 D-1 Destination별 출하 초안 자동생성 (기본 우선순위는 Destination 1,2,3,4 순서이고, 화면에서 전체 Destination 공통 우선순위를 변경 가능. 변경 시 그 순서대로 OK 배정)

- **되면 좋은**:
  - 출하 계획 대비 진행률 관리 (Config·Destination별 계획 vs 기준 시점까지 출하 완료 수량, 날짜별 누적) — ✅ 완료, "진행 상황" 참고
  - NG Material 원인분석 질문 + 비교 Config 추천
  - 분석 결과 Excel 다중시트 다운로드 (Yield/NG Analysis·Process Dashboard·Shipment Risk·Shipment Draft 4개 완료 — "진행 상황" 참고. 출하 이력은 미구현)

- **이번엔 안 하는 것**:
  - 로그인·역할별 권한, 감사 로그, 백업 정책 등 운영 기능
  - 외부 클라우드 사용 승인/사내 서버 배포 검토 (실데이터 적용 단계 이슈, 이번엔 해당 없음)
  - Destination별 출하 현황 화면(8.4)의 별도 화면 구성 — 필요하면 D-1 초안에 통합 표시로 대체

## ④ Phase 분할과 각 Phase 완료 기준

1. Excel Parser + 정합성 검증 — 완료: 5개 파일 업로드 시 헤더 기준으로 파일 종류가 자동 판별되고, 정합성 위반 케이스(예: Input≠Output+NG)를 넣으면 오류 위치가 화면에 표시된다. 실제 파일 구조는 5종이 서로 다름(직접 열어서 확인한 결과이며, 원본 구현안 문서의 "주요 데이터" 설명은 필드 의미만 맞고 실제 행/열 배치와는 다름):
   - Config 정보, Config별 출하 Plan: Config가 열, 속성(Input Qty/Shipment Qty/Material·Type, Destination 1~4)이 행인 교차표 → 뒤집어서 파싱
   - Daily Plan: 날짜가 열, Line·Process가 행인 간트차트형 배치, 셀에 Config 이름이 있으면 그 날짜가 해당 Config·Process의 계획일. "Shipment" 행이 계획 출하일. OK Ship/Waiver NG/Status 열은 이 파일에 없음 — 정합성 검증 시 Config 출하 테이블의 Label(OK/Waiver NG)·Qty를 집계해서 사용
   - 공정 status: 날짜+시간(9AM/6PM)마다 반복되는 블록 구조, 블록 안에서 Config당 Input/Output/NG가 3개 행에 나뉘어 있음(34개 스냅샷 반복)
   - Config 출하 테이블: 단순 표이지만 Config가 바뀔 때마다 헤더 행이 중간에 다시 나타남 → 파싱 시 반복 헤더 행을 데이터로 오인하지 않고 걸러내야 함
   컬럼은 위치(몇 번째 열)가 아니라 헤더 이름으로 찾아 매핑한다. 완료 후 사용자 승인을 받고 Phase 2로 진행한다.
2. 수율 이상점 탐지 + 목표 수율 입력 — 완료: 가상데이터 기준 Config 2·4의 Process 7·11이 수율 이상점(위험/주의)으로 자동 표시된다. 화면에서 Process별 목표 수율을 입력하면 그 값이 기준 수율로 쓰여 이상점 판정 결과가 바뀐다 (미입력 Process는 기존처럼 여러 Config의 중간값을 자동계산해서 기준 수율로 사용). 입력값이 0~100% 범위를 벗어나거나(예: 음수, 100% 초과) 숫자가 아니면 저장을 거부하고 화면에 오류를 표시한다. 위험/주의 절대 임계값(기본 90%/97%, 기준수율 대비 10%p/5%p)도 화면에서 조정 가능하고, 바꾸면 이상점 판정 결과가 그에 맞게 바뀐다. 완료 후 사용자 승인을 받고 Phase 3으로 진행한다.
3. 일정편차 + 지연 알람 — 완료: 화면에서 기준 시점(날짜+9AM/6PM)을 선택할 수 있고, Line 1/Line 2로 구분된 그룹 아래 각 Config의 "현재 대기 Process"(Input은 있지만 Output이 아직 없는 가장 앞선 Process)와 Daily Plan 계획일 대비 지연/선행/계획준수/완료 상태가 표시된다. Daily Plan 날짜는 "완료 목표일"로 해석한다. 지연일수(=기준 시점 - 현재 대기 Process의 Daily Plan 계획일)가 2일 이상이면 주의, 3일 이상이면 위험으로 알람 표시한다. 완료 후 사용자가 지연일수 계산이 정확한지 확인하고 승인한 뒤 Phase 4로 진행한다.
4. 출하 부족 Risk 판정 — 완료: 가상데이터 기준 Config 2·4가 Waiver Dependent로, 다른 정상 Config는 OK로 정확히 표시된다. 완료 후 사용자 승인을 받고 Phase 5로 진행한다.
5. 출하 D-1 초안 생성 — 완료: Daily Plan 기준 다음날 출하 대상 Config에 대해 Destination별 OK/Waiver 배정 초안 표가 생성된다 (Config 2·4 가상데이터로 검증). 기본 우선순위는 Destination 1,2,3,4 순서이며, 화면에서 전체 Config 공통 우선순위를 변경할 수 있다. OK 물량이 Destination 계획 합계보다 부족할 때는 그 우선순위 순서대로 배정한다. 화면에서 우선순위를 바꾸면 D-1 초안 표의 Destination별 배정 값이 그에 맞게 바뀌는 것으로 통과 기준을 삼는다(구체적 배정 수치의 정답 검증은 기본 우선순위 1,2,3,4 케이스만 Config 2·4로 확인). 완료 후 배정 결과가 Config 2·4 가상데이터 기준으로 맞는지 사용자 승인을 받고 Phase 6으로 진행한다.
6. 대시보드 통합 — 완료: 업로드→분석→초안까지 하나의 화면 흐름(메뉴 전환)으로 이어지고, 새로고침 후에도 최근 업로드 결과가 유지된다.

## ⑤ 완료를 판정할 방법 (검증 게이트)

- **기계가 판정하는 것**: 5종 파일 각각의 실제 구조(교차표 2종, 간트차트형 Daily Plan, 반복 블록형 공정 status, 반복 헤더가 섞인 Config 출하 테이블)에서 값이 올바르게 추출되는지, 열 순서를 바꾼 테스트 파일도 헤더 이름 매핑으로 정상 파싱되는지, 정합성 검증 규칙 6종(OK Ship/Waiver NG는 Config 출하 테이블 집계로 계산)(Config 일치, Shipment Qty=Total Shipment=OK+Waiver, Destination 합계=Total Shipment, Input=Output+NG, 이전 Output=다음 Input 등), Config 2·4 이상점/Risk 자동판정 결과가 가상데이터 기준값과 일치하는지, 지연일수(Daily Plan 대비)가 2일/3일 임계값대로 주의/위험 알람으로 표시되는지, Destination 우선순위를 기본값(1,2,3,4)으로 뒀을 때 Config 2·4 배정 결과가 맞는지 그리고 우선순위를 바꾸면 D-1 초안 표의 배정 값이 실제로 바뀌는지, Process별 목표 수율을 입력하면 이상점 판정 결과가 그 값 기준으로 바뀌는지, 위험/주의 절대 임계값을 바꾸면 판정 결과가 그에 맞게 바뀌는지, 0~100% 범위 밖 값이나 숫자가 아닌 값을 입력하면 저장이 거부되고 오류가 표시되는지 자동 테스트로 확인.
- **사람이 눈으로 보는 것**: 대시보드 화면의 표·색상 표시가 실제로 읽기 쉬운지, 출하 D-1 초안 표의 배정 결과가 상식적으로 맞는지.
- **내가 직접 승인할 지점**: Phase 1(Parser) 완료 후 실제 진행 여부, Phase 2(수율 이상점) 결과가 Config 2·4 사례와 맞는지 확인한 뒤 Phase 3 진행, Phase 3(일정편차+지연 알람) 지연일수 계산이 정확한지 확인한 뒤 Phase 4 진행, Phase 4(Risk 판정) 결과가 문서 예시(Config 2·4 Waiver Dependent)와 일치하는지 확인한 뒤 Phase 5 진행, Phase 5(D-1 초안) 배정 결과가 Config 2·4 가상데이터 기준으로 맞는지 확인한 뒤 Phase 6 진행.

## GitHub 저장소 URL
https://github.com/seunguga88-web/Daniel-Kuk.git

## 1:1 코칭에서 가장 묻고 싶은 것 (우선순위 순)

코칭에서 별다른 답변을 받지 못해, 아래 중 3·4번은 MVP 기본값으로 결정하고 진행함. 1·2번은 여전히 열려 있고, 5번은 구현 착수 직전 발견된 새 이슈로 가장 시급함.

0. **[신규, 최우선] 가상데이터 5개 파일의 실제 구조가 원본 구현안 문서 설명과 다름** — Config 정보·Config별 출하 Plan은 Config가 열로 뒤집힌 교차표, Daily Plan은 간트차트형 배치(게다가 "OK Ship/Waiver NG/Status" 열이 실제로는 없음 — 이 값은 Config 출하 테이블의 Label/Waiver Status 열에 있음), 공정 status는 34개 스냅샷이 반복되는 블록 구조. Phase 1 파서를 이 실제 구조에 맞게 다시 설계해야 하고, 시간 예산도 재산정이 필요함 (아래 "시간 예산 점검" 참고).
1. **시간 예산이 빠듯함** — 실제 파일 구조 발견 이후 재산정 필요 (기존 6.5~9시간 추정은 파일이 단순 표라는 가정 하에 나온 것).
2. **Waiver 미승인 물량을 출하 D-1 초안에 포함시킬지** — 원본 구현안(16장)에서 이미 "확정 필요" 업무 규칙으로 짚었던 항목. MVP 기본값(잠정): Waiver 필요 수량으로만 표시하고 확정 출하 수량엔 미포함.
3. ~~수율 위험/주의 절대 임계값 고정 여부~~ → 결정됨: 화면에서 조정 가능하게 구현 (Phase 2 완료조건에 반영).
4. ~~Destination 우선순위 규칙~~ → 결정됨: 화면에서 자유 설정, 기본값 1,2,3,4 (Phase 5에 반영).
5. **[신규] 출하 부족 Risk 판정의 "Risk" 상태 기준을 임의로 정함** — 원본 문서에 "Risk: 예상 양품이 출하 계획보다 부족할 가능성 있음"이라고만 있고 정확한 수식이 없어서, "부족분은 있는데 승인된 Waiver NG가 아직 0인 경우"로 직접 정의함. 실제 업무에서 맞는 정의인지 확인 필요.

--- 아래는 폼에 넣지 않는 작업 메모 ---

## 구현 환경

Next.js(TypeScript, App Router) 프로젝트를 `process-dashboard/` 서브폴더에 생성함 (폴더 이름에 한글·공백이 있어 npm 패키지명 제약상 저장소 루트에는 직접 생성 불가). `xlsx`(SheetJS), `exceljs` 설치 완료. 이후 Phase 구현은 이 서브폴더 안에서 진행.

## 되돌아갈 지점과 데이터
- **되돌리는 방법**: GitHub 저장소(https://github.com/seunguga88-web/Daniel-Kuk.git)에 Phase 단위로 커밋해서, 문제 생기면 이전 커밋으로 되돌아간다.
- **실데이터·자격증명 없이 되게 만드는 방법**: 이미 업로드된 가상데이터 Excel 5개만으로 전체 개발·테스트가 가능 (실데이터 불필요, 별도 대체 작업 없음).

## 고칠 곳 (반박 결과)

반박에서 나온 5개 지적 중 4개 수용, 1개는 미정으로 유보:

- **수용 1**: 출하 D-1 초안의 Destination 배정 규칙이 미정이었음 → 최초엔 MVP 규칙(Destination 1부터 순서대로 배정)으로 정했으나, 이후 사용자 요청으로 화면에서 우선순위를 직접 설정하는 방식으로 변경함(전체 Destination 공통 순서, Phase 4 완료조건에 반영).
- **수용 2 (기준값 고정)**: 받아들이지 않음 → "1:1 코칭에서 가장 묻고 싶은 것"으로 이관.
- **수용 3**: Phase 2, 4, 5에 승인 지점이 없었음 → Phase 2 완료 후 승인 지점을 추가함(Phase 4·5는 그대로 유보, 필요시 진행 중 추가 가능).
- **수용 4 (Phase 1 부담)**: Phase 1이 5종 파서+6개 검증규칙으로 다른 Phase보다 무겁다는 지적은 인지했으나, Phase 재분할은 하지 않고 그대로 진행하기로 함 — 실제 구현 중 시간이 부족하면 그때 현장에서 조정.
- **수용 5**: Daily Plan 날짜 해석(시작일 vs 완료목표일)이 불명확했음 → "완료 목표일"로 Phase 2 완료조건에 명시함.

### 2차 반박 (범위 확장 후 재검토)

범위에 목표수율 입력·Destination 우선순위 설정·Config간 진행속도 알람이 추가된 뒤 다시 반박을 받아 5개 지적 모두 수용:

- Phase 2가 4개 기능(일정편차·수율이상점·목표수율입력·진행속도알람)을 한 덩어리로 묶어 범위 과다였음 → Phase를 5개에서 6개로 나눠, Phase 2(수율 이상점+목표수율입력)와 Phase 3(일정편차+진행속도알람)으로 분리함.
- Config간 진행속도 알람 임계값이 미정이었음 → 2일 이상 느리면 주의, 3일 이상 느리면 위험으로 확정.
- Destination 우선순위 기본값이 없었음 → 기본값 1,2,3,4 순서로 확정하고, 화면에서 변경 가능하도록 유지.
- Phase 5(D-1 초안, 구 Phase 4)에 승인 지점이 없었음 → 완료 후 배정 결과 확인 승인 지점을 추가함.
- 목표 수율 입력값 유효성 검사가 없었음 → 0~100% 범위 밖 값과 숫자가 아닌 값을 거부하고 오류를 표시하도록 Phase 2 완료조건에 추가함.

### 3차 반박 (Phase 분할 이후 재검토)

- Phase 3→4 사이에 승인 지점이 없었음 → Phase 3(일정편차+지연 알람) 완료 후 승인 지점을 추가함.
- "Config간 진행속도 알람"의 검증 기준이 구현 시점까지 미정이었음 → 사용자 요청으로 설계를 단순화: Config끼리 비교하지 않고, 이미 정의된 "Daily Plan 대비 지연일수"가 2일 이상이면 주의, 3일 이상이면 위험으로 표시하는 것으로 변경. 기존 일정편차 계산을 그대로 재사용하므로 검증도 같은 방식으로 가능해짐.
- Destination 우선순위를 바꿨을 때의 배정 결과에 구체적 기대값이 없었음 → "우선순위를 바꾸면 D-1 초안 표의 Destination 배정 값이 바뀐다"는 것 자체를 통과 기준으로 확정(기본 우선순위 1,2,3,4 케이스만 Config 2·4 숫자로 정답 검증).
- 범위가 계속 커지는 것에 대한 재확인 요청 → Phase별 예상 소요시간을 다시 점검함 (아래 "시간 예산 점검" 참고).

## 시간 예산 점검

### 3차 반박 시점 추정 (파일이 단순 표라는 가정 하에, 지금은 낡은 추정치)
Phase 1(1.5~2h) + Phase2(1~1.5h) + Phase3(45분~1h) + Phase4(45분~1h) + Phase5(1.5~2h) + Phase6(1~1.5h) = 약 6.5~9시간.

### 구현 착수 직전 재확인 (가상데이터 실제 구조 확인 후)
가상데이터 5개 파일을 직접 열어보니 4/5개 파일이 단순 표가 아니라 교차표·간트차트·반복 블록 구조였음. Phase 1이 "헤더로 컬럼 매핑"이 아니라 "파일마다 다른 구조를 파싱하는 로직 4종"을 새로 짜야 하는 수준으로 무거워짐 — Phase 1만 3~4시간으로 늘어날 가능성이 있음. 이 경우 전체 합계가 8~10시간대로 늘어나 6~8시간 예산을 확실히 초과할 수 있음.

**권장**: Phase 1을 시작해서 실제 소요 시간을 먼저 재보고, 그 시점에 "되면 좋은" 항목 배제는 물론 "반드시" 항목 중 일부(예: Destination 우선순위 설정 UI, 목표 수율 임계값 조정 UI)도 기본값 고정으로 되돌릴지 재판단하는 것이 안전. "되면 좋은" 3개 항목(출하 수정 이력, NG Material 분석, Excel 다운로드)은 이번 세션에서 하지 않는 것으로 확정.
