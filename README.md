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

## 실행 방법

로컬 PC에서 확인할 때는 `index.html` 파일을 직접 여는 대신 작은 로컬 서버로 실행하는 편이 안전합니다.

```powershell
python -m http.server 8000
```

그 다음 브라우저에서 `http://localhost:8000`을 엽니다.

카메라는 보통 `localhost` 또는 HTTPS에서만 안정적으로 허용됩니다. iPhone Safari에서 쓰려면 GitHub Pages 같은 HTTPS 정적 호스팅으로 배포하세요.
