# 겨울방학 주간 시간표

겨울방학 강좌를 요일·시간대별로 담고, 겹침과 신청 상태를 관리하는 시간표 앱입니다.
크롬에서 주소를 열면 "앱 설치"로 설치할 수 있습니다.

| 폴더 | 내용 |
|---|---|
| [`timetable-app/`](timetable-app/) | 앱 (HTML, 서버 없이도 동작). GitHub Pages 로 배포 |
| [`server/`](server/) | (선택) 담은 수업·신청 상태·내 일정을 저장하는 작은 서버. Cloudflare Workers 로 배포 |

담은 내용은 기본적으로 **그 기기의 브라우저 안에만** 저장됩니다. 여러 기기에서 같은 내용을 보려면 서버를 올리세요.

## 앱 올리기
저장소 Settings → Pages → Source 를 **GitHub Actions** 로 → Actions 탭에서 **시간표 앱 배포** 실행 → 요약의 주소 열기.

## 서버 올리기 (컴퓨터 없이 휴대폰으로)
GitHub 가 대신 올려 줍니다(`.github/workflows/server.yml`). 비용은 무료(Cloudflare Workers 무료 범위)입니다.

1. **Cloudflare** https://dash.cloudflare.com 가입 → 왼쪽 메뉴 **Workers & Pages** 를 한 번 열어 두기 (무료 주소 `○○.workers.dev` 가 이때 만들어짐)
2. 같은 화면의 **계정 ID**(Account ID) 복사
3. 오른쪽 위 사람 아이콘 → **내 프로필 → API 토큰 → 토큰 생성 → "Cloudflare Workers 편집"(Edit Cloudflare Workers) 템플릿 → 사용** → 계정 리소스에 내 계정 선택 → 요약 계속 → 토큰 생성 → 복사 (한 번만 보여요)
4. **GitHub** 이 저장소 → Settings → Secrets and variables → Actions → **New repository secret** 으로 아래 3개 넣기
   (휴대폰에서는 브라우저 메뉴의 "데스크톱 사이트"를 켜면 Settings 탭이 보여요)

   | 이름 | 값 |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | 3번 토큰 |
   | `CLOUDFLARE_ACCOUNT_ID` | 2번 계정 ID |
   | `APP_PASSCODE` | 앱에 넣을 비밀번호 (아무 말이나, 한글 가능) |
5. 저장소 **Actions** 탭 → **시간표 서버 배포** → 가장 위 실행 → **Re-run all jobs**
6. 끝나면 실행 화면 아래 요약에 **서버 주소**가 나와요.
7. 시간표 앱 맨 아래 **기기 간 동기화**에 서버 주소와 비밀번호를 넣고 **서버 연결**.
   다른 기기에서도 같은 주소·비밀번호를 넣으면 같은 내용이 보입니다.

키나 비밀번호는 채팅·코드에 붙여 넣지 말고 GitHub Secrets 에만 넣으세요.

### 서버가 하는 일
| 주소 | 하는 일 |
|---|---|
| `GET /health` | 연결 확인 (비밀번호가 설정됐는지만 알려 줌) |
| `GET /state` | 저장된 시간표 데이터 (비밀번호 필요) |
| `PUT /state` | 시간표 데이터 저장 (비밀번호 필요, 최대 약 300KB) |

- 데이터는 Cloudflare Durable Object(SQLite) 한 곳에 저장됩니다.
- 비밀번호가 맞아야만 읽고 쓸 수 있고, 같은 주소에서 1분에 30번까지만 요청할 수 있습니다.
- 앱 주소(`https://ssea3030g-debug.github.io`)에서 온 요청만 받습니다(`server/wrangler.toml` 의 `ALLOWED_ORIGINS`).
- 두 기기에서 동시에 바꾸면 나중에 저장한 쪽이 이깁니다.
