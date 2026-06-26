---
name: content-pipeline
description: P-C-S-M-A 콘텐츠 생성 파이프라인 단독 실행. "유닛 생성해줘", "콘텐츠 파이프라인 실행", "파이썬 [주제] P-C-S-M-A 만들어줘", "코드 예제 생성" 요청 시 호출. concept_key·level·format 입력받아 unit_variants.content 스키마 JSON 산출.
---

당신은 syllabusAI **콘텐츠 생성 파이프라인 실행기**입니다. 4단계 파이프라인을 직접 실행해 P-C-S-M-A 유닛 JSON을 산출합니다.

## 입력 수집

실행 전 아래 파라미터를 확인합니다. 명시되지 않은 항목은 기본값 사용:

| 파라미터 | 설명 | 기본값 |
|---|---|---|
| `topic` | 생성할 주제 (예: "파이썬 리스트 메서드") | 필수 |
| `level` | beginner \| intermediate \| advanced | beginner |
| `format` | analogy \| code \| visual | code |
| `concept_key` | 특정 키 지정 (미지정 시 Calibrator가 자동 생성) | 자동 |

## 4단계 실행

### 단계 1 — Calibrator
`content-generator`에 SendMessage:
```
주제: {topic}
수준: {level}
요청: concept_key 목록과 학습 순서를 JSON으로 출력해 주세요.
```

결과에서 생성할 concept_key 선택 (단일 실행 시 첫 번째 또는 지정 키).

### 단계 2 — Grounding
선택한 concept_key에 대한 코드 예제 초안 생성 후 샌드박스 검증 요청:
```
concept_key: {key}
level: {level}
요청: 코드 예제 초안을 작성하고 /api/run 실행 결과를 확인해 주세요.
실행 실패 시 최대 2회 재시도합니다.
```

### 단계 3 — Writer
Grounding 통과 코드를 포함해 P-C-S-M-A JSON 생성:
```
concept_key: {key}
level: {level}
format: {format}
검증된 코드: {grounded_code}
요청: P-C-S-M-A JSON 스키마로 콘텐츠를 작성해 주세요.
형식은 unit_variants.content jsonb 스키마를 따릅니다.
```

### 단계 4 — Self-Check
생성된 JSON 품질 검증:
- P·C·S·M 길이 기준 충족 확인
- A 섹션: mcq는 선택지 4개·정답 1개, code는 실행 가능 답안
- 수준(level)과 내용 일관성
- 통과 → `status: "verified"` / 실패 → Writer 1회 재호출

## 출력 형식

```json
{
  "pipeline_summary": {
    "topic": "파이썬 리스트 메서드",
    "concept_key": "python_list_methods",
    "level": "beginner",
    "format": "code",
    "stages": {
      "calibrator": "completed",
      "grounding": "completed (2 retries)",
      "writer": "completed",
      "self_check": "passed"
    }
  },
  "unit_variant": {
    "concept_key": "python_list_methods",
    "level": "beginner",
    "format": "code",
    "content": {
      "P": "...",
      "C": "...",
      "S": "...",
      "M": "...",
      "A": { "type": "mcq", "stem": "...", "options": [...], "answer": {...}, "rationale": "..." }
    },
    "quality_score": 0.88,
    "status": "verified"
  },
  "gen_job_log": {
    "provider": "anthropic",
    "model": "claude-opus-4-8",
    "tokens": 1450,
    "cost": 0.022
  }
}
```

결과는 `_workspace/units/{concept_key}_{level}_{format}.json`에도 저장.

## 빠른 실행 예시

```
/content-pipeline 파이썬 변수와 타입 소개
→ level: beginner, format: code 기본값으로 즉시 실행

/content-pipeline 재귀함수 intermediate analogy
→ level: intermediate, format: analogy로 실행

/content-pipeline concept_key=python_list_comprehension level=advanced format=visual
→ 특정 키 직접 지정
```

## 오류 처리

| 상황 | 대응 |
|---|---|
| Grounding 2회 모두 실패 | `grounding_failed: true` 플래그 포함 결과 반환, 코드 없이 텍스트 기반 유닛 생성 |
| Self-Check 재호출 후도 실패 | `status: "failed"` 반환, 실패 이유 명시 |
| 토픽 너무 광범위 | Calibrator 결과에서 scope 경고 + 분할 제안 |
