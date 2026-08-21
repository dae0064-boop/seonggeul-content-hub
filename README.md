# 성글벙글 콘텐츠 허브

집·회사·노트북 어디서 작업해도 같은 결과물을 얻기 위한 저장소.
작업 결과물과 메모리는 모두 구글 드라이브 폴더
`내 드라이브/성글벙글 원소스 멀티콘텐츠 자동화 구현/`에 저장·백업된다.

```
standards/  ->  00_기준문서/     운영기준·지침
work/       ->  01_작업/         날짜별 콘텐츠 작업물
schedule/   ->  02_발행일정표/   발행 일정
memory/     ->  09_메모리/       작업 메모리
```

새 컴퓨터에서 시작한다면 [docs/SETUP.md](docs/SETUP.md)를 먼저 읽는다.
작업 규칙은 [CLAUDE.md](CLAUDE.md)에 있다.

```bash
./scripts/drive-sync.sh status   # 드라이브 연결 확인
./scripts/drive-sync.sh pull     # 드라이브 -> 저장소
./scripts/drive-sync.sh push     # 저장소 -> 드라이브
```
