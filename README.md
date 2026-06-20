# pokeScanner

개인용 일판 포켓몬 카드 가격 스캐너 웹앱입니다. 현재는 `JP / M1S / 메가심포니아` 세트를 대상으로 하는 정적 HTML/CSS/JS 앱입니다.

## 현재 구조

- `index.html`: 앱 화면과 외부 CDN 로드
- `style.css`: 모바일 Safari 중심 UI
- `app.js`: 카메라, 이름/번호 영역 이미지 OCR, 검색, 최근 기록, 컬렉션 로직
- `data/cards.js`: 카드 정보 DB
- `data/prices.js`: 가격 DB
- `data/visual-index.js`: 선택적 이미지 특징값 DB
- `scripts/build-visual-index.py`: 로컬 카드 시트 이미지에서 visual index 생성
- `service-worker.js`: 정적 앱 파일 캐시

카드 정보와 가격 정보는 `card_id`로 연결됩니다. 가격은 실시간 시세가 아니라 `data/prices.js`에 저장된 마지막 업데이트 기준 로컬 가격입니다.

중요: 원본 카드 이미지는 공개 저장소에 올리지 않는 것을 권장합니다. 로컬 카드 시트 이미지에서 특징값만 뽑아 `data/visual-index.js`에 저장합니다.

## 데이터 구조

`data/cards.js`는 카드 정보만 저장합니다.

- `card_id`
- `language`
- `set_code`
- `set_name_jp`
- `set_name_ko`
- `number`
- `rarity`
- `name_jp`
- `name_ko`
- `name_en`
- `search_keywords`
- `image_url`
- `local_image_path`

`data/prices.js`는 가격 정보만 저장합니다.

- `card_id`
- `nm_jpy`
- `psa10_jpy`
- `quick_sell_nm_jpy`
- `quick_sell_psa10_jpy`
- `updated_at`
- `confidence`
- `sources`
- `source_links`
- `note`

가격이 없으면 앱은 임의 추정값을 만들지 않고 `가격 데이터 없음`으로 표시합니다.

`data/visual-index.js`는 이미지 기반 인식을 위한 선택 DB입니다.

- `card_id`
- `hash` 또는 `visual_hash`: 전체 카드 perceptual hash
- `art_hash`: 일러스트 영역 perceptual hash
- `color` 또는 `color_grid`: 카드 crop 색상 그리드

이 파일이 비어 있으면 앱은 visual-first 후보를 만들 수 없고 OCR/fuzzy 후보만 fallback으로 사용합니다.

## Visual Index 생성

M1S 카드 시트 이미지 6장을 로컬에 둔 뒤 다음 명령으로 visual index를 생성합니다.

```powershell
C:\Users\정서엽\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\build-visual-index.py
```

스크립트는 최근 첨부된 큰 `codex-clipboard-*.png` 시트 6장을 자동으로 찾고, 카드 92장을 순서대로 crop한 뒤 `data/visual-index.js`에 feature만 저장합니다. 원본 이미지와 crop 이미지는 저장소에 저장하지 않습니다.

## 실행 방법

로컬 PC에서 확인할 때는 `index.html` 파일을 직접 여는 대신 작은 로컬 서버로 실행하는 편이 안전합니다.

```powershell
cd C:\Users\정서엽\Downloads\monprice_m1s_full_v3\monprice_m1s_full_v3
python -m http.server 8000
```

그 다음 브라우저에서 `http://localhost:8000`을 엽니다.

카메라는 보통 `localhost` 또는 HTTPS에서만 안정적으로 허용됩니다. iPhone Safari에서 쓰려면 GitHub Pages 같은 HTTPS 정적 호스팅으로 배포하세요.

## GitHub Pages 배포

1. 이 폴더의 파일들을 GitHub 저장소에 올립니다.
2. GitHub 저장소에서 `Settings` → `Pages`로 이동합니다.
3. 배포 소스를 `Deploy from a branch`로 선택합니다.
4. `main` 브랜치의 `/root` 또는 `/docs`를 선택합니다.
5. 생성된 `https://사용자명.github.io/저장소명/` 주소를 iPhone Safari에서 엽니다.

## 인터넷 연결 필요 여부

앱 자체와 카드/가격 DB는 로컬 정적 파일입니다. 다만 아래 라이브러리는 CDN에서 불러옵니다.

- Tesseract.js: 번호/이름 OCR

첫 로딩과 첫 OCR은 인터넷 연결과 라이브러리 초기화 때문에 느릴 수 있습니다.

## 스캔 방식

1. 카메라 가이드 안에 카드 이름과 하단 번호가 오도록 맞춥니다.
2. 앱은 카드 crop 이미지를 먼저 만들고, `data/visual-index.js`가 있으면 이미지 특징값을 먼저 비교합니다.
3. visual confidence가 높으면 OCR을 기다리지 않고 이미지 기반 후보를 먼저 띄우거나 lock-on합니다.
4. OCR은 번호/이름이 보일 때만 보조 검증으로 사용합니다.
5. visual index가 비어 있으면 OCR/fuzzy 후보가 임시 fallback으로 동작합니다.
6. 사진 스캔을 선택하면 찍은 이미지에서 카드 crop, 이름 영역, 번호 영역을 즉시 분석합니다.
7. 숫자 OCR에서 자주 틀리는 `O/I/S/Z/B/G` 등은 숫자로 보정합니다.
8. `O5I/O92`, `05I/092`, `51/92`, `087/O63`, `090063` 같은 결과도 DB 번호와 유사도 비교를 합니다.
9. 카드 이름은 일본어, 한글, 영어 이름을 모두 비교합니다.
10. 점수가 애매하면 바로 실패하지 않고 top 3 후보를 보여줍니다.
11. 최근 후보를 최대 10번까지 모아 같은 후보가 반복되면 신뢰도를 높입니다.
12. 인식 실패 시 `001/063` 또는 첫 번째 카드로 대체하지 않습니다.

## Image-First 전환 상태

현재 앱에는 visual-first 파이프라인의 입력과 비교 구조가 들어가 있습니다.

카드 crop → visual feature 추출 → visual index top-k 검색 → OCR 보조 점수 결합 → voting/lock-on

현재 `data/visual-index.js`에는 JP / M1S 92장의 로컬 visual feature가 들어 있습니다. 실제 카메라 crop 품질, 카드 기울기, 조명, 슬리브 반사에 따라 threshold 튜닝은 더 필요합니다.

언어 판별은 아직 구현하지 않았습니다. 확장 방향은 일판 이미지로 먼저 카드 후보를 찾고, 그 다음 보이는 문자 영역을 훑어 JP / KR / EN 여부를 보조 확인하는 구조입니다. OCR이 최종 판단을 지배하지 않고 visual match를 우선합니다.

## 인식 상태 색상

- 빨강: 인식 전, 실패, DB 후보 없음
- 주황: OCR 인식 중, 후보 확인 중
- 파랑: 스캔 완료

## 가격 표시

스캔 또는 검색으로 카드가 확정되면 같은 `card_id`를 가진 가격 레코드를 `data/prices.js`에서 찾습니다.

표시 항목:

- 카드명
- 세트명
- 번호
- 레어도
- NM 가격
- PSA10 가격
- 업데이트 날짜
- 신뢰도
- 시세 확인 링크

브라우저에서 메루카리, 야후옥션, 카드러시를 실시간 크롤링하지 않습니다. `시세 보기` 버튼은 확인용 검색 링크만 엽니다.

## 다음 단계 후보

- `scripts/update-prices` 형태의 반자동 가격 갱신 스크립트 추가
- 다른 세트와 언어 DB 추가
- 카드 이미지 경로 연결
- 정적 앱 안정화 후 Vite + React + TypeScript 마이그레이션 검토
