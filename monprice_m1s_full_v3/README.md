# MonPrice M1S Scanner

개인용 일판 포켓몬 카드 가격 스캐너 웹앱입니다. 현재는 `JP / M1S / 메가심포니아` 세트를 대상으로 하는 정적 HTML/CSS/JS 앱입니다.

## 현재 구조

- `index.html`: 앱 화면과 외부 CDN 로드
- `style.css`: 모바일 Safari 중심 UI
- `app.js`: 카메라, 카드 외곽선 감지, OCR, 검색, 최근 기록, 컬렉션 로직
- `data/cards.js`: 카드 정보 DB
- `data/prices.js`: 가격 DB
- `service-worker.js`: 정적 앱 파일 캐시

카드 정보와 가격 정보는 `card_id`로 연결됩니다. 가격은 실시간 시세가 아니라 `data/prices.js`에 저장된 마지막 업데이트 기준 로컬 가격입니다.

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

- Tesseract.js: 번호 OCR
- OpenCV.js: 카드 외곽선 감지

첫 로딩과 첫 OCR은 인터넷 연결과 라이브러리 초기화 때문에 느릴 수 있습니다.

## 스캔 방식

1. 카메라 영상에서 카드 외곽선을 감지합니다.
2. 카드가 2~3회 연속 비슷한 위치에서 잡히고 약 0.5초 이상 안정되면 OCR을 1회 실행합니다.
3. OCR 대상은 카드 전체가 아니라 하단 번호 영역입니다.
4. `087/063`, `090/063` 같은 번호 패턴만 유효하게 인정합니다.
5. 현재 선택된 세트 DB에 없는 번호는 `DB에 없는 카드`로 표시합니다.
6. 인식 실패 시 `001/063` 또는 첫 번째 카드로 대체하지 않습니다.

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
