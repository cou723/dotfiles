# Agent permission と filesystem ceiling

Pi core を変更せず、既存拡張 3 個とこの拡張 1 個で構成する。

| 責務 | 実装 |
| --- | --- |
| Primary identity / 本文 prompt / モデル選択 | `pi-agent-router@0.9.0` |
| 子セッションの実行 | `@gotgenes/pi-subagents@21.9.1` |
| 決定論的 ALLOW / ASK / DENY / 親 UI への承認転送 | `@gotgenes/pi-permission-system@36.2.1` |
| filesystem の hard boundary | `sandbox-ceiling` + bubblewrap |

Pi 0.99.2 / Node 24 / Linux / bubblewrap 0.11.2 で検証する構成。
permission-system の 37.x は Pi 1.0 以降を要求するため固定する。
既存パッケージのソースは変更せず、permission engine・agent runtime・shell parser は自作しない。
Permission 拡張自身の既存 shell parser と wildcard matcher をそのまま利用する。

## 使い方

設定適用後に Pi を再起動する。
`/agent` の picker で `planner` / `worker` / `reviewer` / `researcher` を選択する。
この router は TUI / RPC で UI があると引数付き `/agent planner` でも picker を開く。
UI のない環境では引数で選択できる。

初期 Agent の `orchestrator` は既存 router の既定名であり、Planner と同じ read-only 役。
`/agent off` は filesystem ツールを開放しない。identity がないと ceiling は拒否する。

```text
/sandbox-status
/sandbox-narrow {"read":["${cwd}"],"write":[]}
```

narrowing は現在のセッションにだけ適用し、後から広げられない。
新しいセッションを開始すると解除される。
子の invocation は親とは独立しており、親の narrowing を継承しない。
trusted launcher は `sandbox-ceiling:invocation-narrow` イベントで
`{sessionId, cwd, sandbox: {read, write}}` を渡し、指定の子だけを狭められる。
既存 subagent ツールには任意の sandbox 引数を追加していない。

委譲 API は以前の nicobailon 版と異なる。

```javascript
subagent({
  subagent_type: "worker",
  prompt: "対象と完了条件を含む実装依頼",
  description: "短い説明"
})
```

結果取得は `get_subagent_result({agent_id, wait: true})`、
実行中の連絡は `steer_subagent({agent_id, message})`。
router 側の別委譲経路 `task` は permission で DENY。
router 自身は子にロードしない。子の identity を親の既定 Agent に戻さないため。

## Pi 自身の設定変更

通常の `pi` を起動し、`/agent` の picker で **pi-configurator** を選ぶ。
`--pi-config` は不要で、拡張にも登録しない。
`/sandbox-status` で実効範囲を確認する。
過去の `/sandbox-narrow` を引き継ぐ再開セッションでは narrowing も維持される。

- グローバル Agent 定義はユーザー管理の信頼済み権限源とする。Agent 名による特別扱いはない。
- `sandbox.read` / `sandbox.write` が範囲の正本。通常の Worker は定義どおり cwd-only。
- グローバルの宛先は全 Agent 共通で read-only。通常の edit/write/bash で直接変更しない。
- project の settings は宣言範囲内なら編集できる。Agent definitions と extensions は通常 read-only。
- グローバル定義の `capabilities: [pi_project_config_write]` を持つ primary Agent は、起動元の `.pi/` 配下も宣言された write 範囲内で編集できる。pi-configurator はこの権限を持つ。子セッション・project の同名上書きからは取得できず、global の直接書き込み保護と invocation narrowing は維持する。
- `capabilities: [pi_config_apply]` を持つグローバル Agent は primary session で限定 apply を利用できる。
  permission の `pi_config_apply: ask` と tools への登録も必要。
- project 定義からは apply capability を取得できない。子セッションの global apply も拒否する。
- 定義のスナップショットを起動時に取得する。変更を反映するには Pi を再起動する。
- `${cwd}` の write を宣言すると、home からの起動でも home の write を許可する。
  cwd の場所に応じた暗黙の縮小は行わない。global `.pi` 自体とその配下は共通保護で除外する。

グローバル反映は既存 permission-system が **ASK** を処理する `pi_config_apply` を使う。
承認 route がなければ DENY。必ず対象を指定し、先に preview を確認する。

```javascript
pi_config_apply({targets: ["settings.json", "agents/worker.md"], dryRun: true})
pi_config_apply({targets: ["settings.json", "agents/worker.md"], overwrite: true})
```

対象は global agent directory 相対で、`AGENTS.md` / `settings.json` / `sandbox-ceiling.json` / `subagents.json` と、
`agents` / `skills` / `extensions` 以下だけ。空対象・traversal・外向き symlink は拒否する。
`overwrite:true` は差分のある既存 target を置き換える指定なので、人の既存変更を調べてから承認する。
指定がなければ chezmoi の非対話実行で競合が拒否・スキップされる可能性がある。host の persistent state は使用しない。

apply は独立した bubblewrap process 内の固定 chezmoi コマンドで行う。
source は read-only、host config/hooks は読まず、scripts を除外し、外部取得を停止する。
cache/state は一時領域。global destination の既存の非管理エントリ（auth / session / npm 等）は read-only で保護する。
atomic rename のため apply process に限り destination parent の write が必要。
**chezmoi templates は trusted code** であり、template から実行したプログラムを指定ファイル単位で隔離する設計ではない。
対象指定は CLI の反映対象を制限するものであり、任意の悪意ある template を安全に評価できるとは主張しない。
複数対象の反映は chezmoi 標準の動作で、全対象の atomic transaction ではない。

自作の追加は宣言的 filesystem policy の強制と固定 apply wrapper。
新しい permission engine / Agent runtime はない。profile は `sandbox-ceiling.json` の `maintenance` で設定する。
設定・Agent 定義・拡張を変えた後は、このプロセスで `/reload` せず終了し、通常の Pi を起動して検証する。
package 実体のインストールやユーザー chezmoi hooks の実行が必要な場合は、人の操作または Pi 標準の起動処理に任せる。

## Agent Definition

正本は chezmoi の `dot_pi/agent/agents/<name>.md`。
global 定義は `~/.pi/agent/agents/<name>.md`、
trusted project 定義は `<cwd>/.pi/agents/<name>.md`。
名前と filename を一致させる。sandbox 未定義・不正・identity 不明は拒否。

**permission は採用パッケージの flat schema を使う。**
概念 brief の `permission.tools` ではない。
`tools` は既存拡張の CSV allowlist 形式。本文は既存拡張が prompt に使う。

```yaml
---
name: worker
mode: all
tools: read, grep, find, ls, edit, write, bash
prompt_mode: replace
inherit_context: false
locked: true
permission:
  "*": ask
  read: allow
  edit: allow
  write: allow
  external_directory: allow
  bash:
    "*": allow
    "git push*": ask
    "rm -rf *": deny
sandbox:
  read: ["${cwd}"]
  write: ["${cwd}"]
---
依頼された実装と検証を担当する。
```

permission は既存拡張だけが評価する。
ceiling の `tool_call` hook は filesystem 範囲だけを判定する。
codemode 内の nested tool calls も Pi の通常 gate を通る。

`ASK` は親 / ローカル UI route に送られ、route がなければ DENY。
転送先でも **requester の Agent 名**で評価されるので、
Planner の edit DENY と Worker の edit ALLOW の intersection は取らない。
LLM authorizer chain は空、YOLO は false。

## Sandbox の合成

```text
effective = trusted global agent sandbox ∩ invocation narrowing
```

従来の `sandbox-ceiling.json.ceiling` は使わない。グローバル Agent 定義はユーザーだけが編集する前提。
project 定義がある場合、その sandbox をさらに intersection する。
グローバル同名定義のない project Agent の上限は cwd-only。
project trust はグローバル権限の拡大を許可するものではない。

子は自身の Agent sandbox を使い、親の read-only scope や invocation narrowing は継承しない。
Agent の `${cwd}` はそのセッションの cwd で解決し、実効 root を固定する。
global 定義は拡張ロード時、project 定義は初回 session start 時にスナップショットを取得する。
設定の変更や apply は現在のプロセスの権限を更新しない。再起動で読み直す。

read/write は literal path の配列。glob、未定義の変数、NUL は拒否。
空配列は権限なし。
write root は read root の内側かつ、既存ディレクトリ / ファイルである必要がある。
root 内の新規ファイルやディレクトリは作成できる。
whole-machine `/` root は拒否する。

## OS enforcement

7 ツール（read / grep / find / ls / edit / write / bash）を override し、
bubblewrap 内の Node helper から **Pi 標準ツール**を実行する。
画像・検索・編集・bash の処理自体は作り直さない。

- 空の root filesystem に許可された host path だけを bind mount。
- read mount は read-only、write mount は read-write。
- mount の source は fd で固定し、検査と mount の間の symlink swap を防ぐ。
- private PID namespace と新しい `/proc` により親の `/proc/<pid>/root` を見せない。
- root は read-only。`/tmp` と `/dev/shm` は破棄される tmpfs であり、host の同名パスを開放しない。
- global agent directory（通常はその親の `.pi` 全体）と、
  project の Agent definitions / extensions は、グローバル定義の `pi_project_config_write` を持つ primary Agent 以外では cwd 内にあっても read-only。
  保護先内にある write root は除外する。project settings は宣言範囲内なら編集可能。
- edit/write の親側 mutation queue は別プロセス間でも同一ファイル操作を直列化。
- 起動不可 / timeout / cancellation / 不正な結果は操作失敗。非 sandbox 実行に戻さない。

`runtimeRead` は shell / Node / ライブラリ / rg / fd を実行するための
**明示的な読み取り専用の例外**。
現在は OS の実行ファイル・Nix store・pnpm store・Pi bin・helper と
一部の名前解決 / CA 設定を公開する。
bash からこれらの静的 runtime files を読むことはできる。
Agent の通常ファイルツールが workspace 外の任意ファイルを読むことはできない。

## V1 の境界・制約

- Linux bubblewrap 専用。macOS / Windows は fail closed。backend interface は差し替え可能。
- Extension は trusted code。Pi と MCP / LSP / 他拡張の内部処理自体は host 上。
  **任意の追加ツールを filesystem sandbox に包むものではない。**
  追加ツールに ALLOW を与える際は、そのツールが host の filesystem に触れるかを別途確認する。
- network / credentials / environment / Unix socket の隔離はない。
  PID namespace は filesystem escape を防ぐために使うが、包括的な process/IPC 保護は主張しない。
- cwd 外のユーザースキル資料や別 repo は、グローバル Agent の read に明示すれば読める。
  グローバル定義をユーザー以外が変更できる環境を脅威モデルに含めない。
- `git-commit` は `~/.gitconfig` を read-only で読む。WSL では `/init`、`/run/WSL` と
  1Password の `op-ssh-sign-wsl.exe` 1 ファイルも Agent 定義の read に含める。
  ヘルパーの配置は template が PATH の WindowsApps エントリから取得し、ユーザー名や drive を固定しない。
  WindowsApps 自体、Windows home、Windows drive 全体は公開しない。
  `WSL_INTEROP` は起動時の環境を使い、socket の番号を固定しない。
  `/run/WSL` の公開は Windows process 起動の IPC を可能にするため、Windows 側プロセスには
  Linux の filesystem boundary が及ばない。署名用途だけに使う。
  `git-commit` は明示パスの stage、通常の commit、署名用一時領域の作成・限定清掃を ALLOW とし、
  push・履歴改変・Git 設定変更を DENY とする。未知のコマンドや shell wrapper は ASK のまま。
  1Password のアンロック・署名承認や hook の待機は、この ALLOW では省略されない。
  Git の署名用一時ファイルは、cwd 内の Git 管理ディレクトリに作る専用の `0700` ディレクトリへ
  `TMPDIR` を Git プロセス単位で指定する。private `/tmp` は Windows 側から同じファイルとして見えないため使わない。
  成否を問わず自身の一時領域を清掃する。Git 管理ディレクトリが write 範囲外なら停止する。
  namespace 内での実行や署名用一時ファイルの受け渡しに失敗する場合も停止する。
  無署名や sandbox 外実行への fallback はしない。
- 巨大な bash 出力で Pi が作る full-output file は helper の tmpfs にあり、
  helper 終了後は残らない。モデル向けの標準 truncation と codemode の bounded output は保持する。
- `/reload` / 起動失敗の警告を無視しない。拡張を明示的に無効化した Pi はこの境界を持たない。
- project extensions は trusted code を読み込む操作なので、trust の付与は人が判断する。

## 検証

認証情報を使わず、決定論的な fixture provider が実際の親 / 子 Pi セッションを動かす。
RPC の選択 UI だけを自動応答する。TUI の目視操作は別途行う。
テンプレートの描画テストは `.tmpl` が存在する chezmoi ソース側で実行する。

```sh
node --experimental-strip-types tests/definitions.test.mjs
node tests/git-commit-template.test.mjs

POC_MODULES=/absolute/path/to/node_modules \
POC_JITI_ENTRY=file:///absolute/path/to/pi/dist/core/extensions/jiti-loader.js \
  node tests/git-commit-template.test.mjs

POC_SDK_ENTRY=/absolute/path/to/pi/dist/index.js \
  node --experimental-strip-types tests/backend.test.mjs

POC_MODULES=/absolute/path/to/node_modules \
POC_SDK_ENTRY=/absolute/path/to/pi/dist/index.js \
  node --experimental-strip-types tests/integration.test.mjs

POC_MODULES=/absolute/path/to/node_modules \
POC_SDK_ENTRY=/absolute/path/to/pi/dist/index.js \
  node --experimental-strip-types tests/maintenance.test.mjs
```

integration の modules は表の 3 パッケージを含むディレクトリ。
tests は専用一時 Agent directory を作り、実ユーザーの auth / MCP / session は使わない。
必要なら `POC_AGENT_DEFINITIONS` と `POC_PERMISSION_CONFIG` で managed 定義の場所を指定する。
元の設定は chezmoi source のみに編集し、対象パスに限定して apply する。
