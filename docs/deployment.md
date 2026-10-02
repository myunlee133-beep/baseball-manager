# Vercel 배포

## 현재 배포 구성

DUGOUT은 브라우저에서 동작하는 정적 웹 앱입니다. Vercel은 `npm ci`로 의존성을 설치하고 `npm run build`로 `dist/`를 만든 뒤 해당 디렉터리를 배포합니다. `vercel.json`에 이 설정이 들어 있습니다.

Supabase는 현재 필요하지 않습니다. 게임 저장은 각 브라우저의 `localStorage`에 남으며, 브라우저나 기기 사이에 자동으로 동기화되지 않습니다. 계정, 클라우드 저장, 여러 기기 동기화가 필요해질 때 Supabase를 추가할 수 있습니다.

## GitHub 자동 배포 연결

Vercel 프로젝트 `hanazi-s-projects/baseball-manager`의 **Settings → Git**에서 GitHub 저장소 `myunlee133-beep/baseball-manager`를 연결합니다. Vercel GitHub App에 저장소 접근 권한이 있어야 합니다. Production Branch는 `main`, Root Directory는 저장소 루트(`./`)로 설정합니다.

이 저장소의 `vercel.json`을 `main`에 반영한 뒤에는 `main` 푸시가 프로덕션 배포를, 다른 브랜치와 Pull Request가 미리보기 배포를 생성합니다. 환경 변수는 필요하지 않습니다.

## 배포 전 확인 사항

- 실제 선수 이름과 구단명을 사용하므로, 외부 공개 전에 KBO·선수협의 명칭 및 초상권 사용 허가를 확인해야 합니다. 권한이 확보되지 않았다면 이름·구단 데이터와 관련 이미지가 공개되지 않도록 정리한 뒤 배포하세요.
- 브라우저 저장 데이터는 배포 후에도 해당 브라우저에 남지만, 브라우저 데이터 삭제 시 사라질 수 있습니다.
- 배포 설정 변경 후 Vercel 미리보기 주소에서 첫 화면과 새로고침을 확인하고 프로덕션으로 반영하세요.
