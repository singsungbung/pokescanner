MonPrice M1S Scanner 실행 안내
==============================

자세한 내용은 README.md를 확인하세요.

로컬 실행:
1. 이 폴더에서 로컬 서버를 켭니다.
   python -m http.server 8000
2. 브라우저에서 http://localhost:8000 을 엽니다.

iPhone Safari 실행:
- file://로 직접 열면 카메라가 막힐 수 있습니다.
- GitHub Pages 같은 HTTPS 정적 호스팅에 올려서 사용하세요.

주의:
- Tesseract.js는 CDN에서 불러옵니다.
- 첫 OCR은 엔진 로딩 때문에 느릴 수 있습니다.
- 가격은 실시간 시세가 아니라 data/prices.js의 마지막 업데이트 기준 로컬 가격입니다.
- 인식 실패 시 기본 카드로 대체하지 않습니다.
