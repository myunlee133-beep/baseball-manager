# DUGOUT 작업 규칙

KBO 스타일 야구 운영 게임. 브라우저용 순수 JS, 실행에 패키지 설치 불필요. 구조는 `README.md`, `docs/engine-port.md` 참고.

## 명령
- `npm run dev` 로컬 서버 (http://127.0.0.1:4173)
- `npm test` 전체 테스트. **PR 전에 반드시 통과**
- `npm run build` 엔진 재생성 + `dist/` 갱신 (`npm install` 필요)

## 브랜치와 PR
- `main`에 직접 푸시하지 않는다. 작업마다 브랜치 하나, PR 하나.
- 브랜치 이름: `feat/…` 새 기능, `fix/…` 버그, `refactor/…` 구조 정리, `docs/…` 문서. 예: `feat/contract`
- 작업 시작 전과 PR 전에 최신 main을 반영한다: `git fetch github && git rebase github/main` (이미 푸시한 브랜치는 `git merge github/main`)
- PR은 작게, 하나의 목적만. 머지는 Squash and merge.
- 이슈가 있으면 PR 설명에 `Closes #번호`.

## 범위와 충돌 방지
- 자기 작업 범위 밖 파일은 수정하지 않는다. 새 로직은 가능하면 새 파일(`game/contract.js` 등)에 둔다.
- 공유 파일(`model.js`의 상태 구조, `app.js`의 화면 전환)을 바꿔야 하면 PR 설명에 명시한다.
- `app.js`, `model.js`는 코드가 한 줄에 압축돼 있어 충돌이 나기 쉽다. 수정 범위를 최소로 하고 포맷 전체를 바꾸지 않는다(정리는 별도 refactor PR).
- `vendor/`는 외부 원본 복사본이므로 수정하지 않는다.

## 저장 데이터
- 브라우저 localStorage에 저장된다(`dugout-prototype-v1`, 경기 저장은 별도).
- 선수·상태 필드를 추가하거나 바꾸면 저장 버전을 올리고, 기존 저장 데이터가 깨지지 않게 마이그레이션이나 기본값을 넣는다.

## 테스트
- 새 로직에는 `tests/*.test.mjs`에 테스트를 추가한다.
- 테스트가 실패하면 실패한 채로 PR을 올리지 않는다. 고칠 수 없으면 PR에 이유를 적는다.

## 커밋
- 메시지는 무엇을 왜 바꿨는지 한 줄로 요약한다.
- 생성물(`dist/`)은 `npm run build`로만 갱신하고 손으로 고치지 않는다.
